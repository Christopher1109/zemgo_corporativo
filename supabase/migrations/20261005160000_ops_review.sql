-- Revisión operativa (oct-2026):
--  1) Recordatorios de WhatsApp: interruptor desde Configuración, envío de prueba y estado.
--  2) Recordatorios: si el asegurado no tiene teléfono, se usa el del responsable de pago.
--  3) Cobros a empresas: revertir un pago registrado por error (vuelve a pendiente / vencido).
--  4) Certificados: la vigencia de las altas se toma de la fecha de alta de la aseguradora.
--  5) Portal: se apaga el modo QA (devolvía el código de acceso en pantalla).

-- 1) WhatsApp ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_settings(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(_uid)
      OR EXISTS (SELECT 1 FROM public.programs p WHERE public.has_program_role(_uid, p.id, ARRAY['admin']::app_role[]));
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_reminders_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT value FROM system_config WHERE key = 'integration.whatsapp.enabled') = 'true'::jsonb, false),
    'lines', (SELECT COALESCE(jsonb_agg(jsonb_build_object('program_code', program_code, 'configured', phone_number_id IS NOT NULL)), '[]'::jsonb) FROM whatsapp_lines),
    'programs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'offset_days', whatsapp_reminder_offset_days) ORDER BY code), '[]'::jsonb) FROM programs),
    'queue', jsonb_build_object(
      'pending', (SELECT count(*) FROM notifications WHERE channel = 'whatsapp' AND template_code = 'PAYMENT_REMINDER_WHATSAPP' AND status = 'pending'),
      'sent_30d', (SELECT count(*) FROM notifications WHERE channel = 'whatsapp' AND template_code = 'PAYMENT_REMINDER_WHATSAPP' AND status = 'sent' AND created_at > now() - interval '30 days'),
      'failed_30d', (SELECT count(*) FROM notifications WHERE channel = 'whatsapp' AND template_code = 'PAYMENT_REMINDER_WHATSAPP' AND status = 'failed' AND created_at > now() - interval '30 days')),
    'last_run', (SELECT jsonb_build_object('at', r.created, 'status', r.status_code, 'body', left(r.content::text, 300))
                   FROM net._http_response r WHERE r.content::text LIKE '%skipped%' OR r.content::text LIKE '%processed%'
                   ORDER BY r.created DESC LIMIT 1),
    'next_7d', (SELECT count(*) FROM payments p JOIN policies pol ON pol.id = p.policy_id JOIN programs pr ON pr.id = pol.program_id
                 JOIN clients c ON c.id = pol.client_id
                WHERE p.status = 'pending' AND pol.company_id IS NULL
                  AND (p.due_date - pr.whatsapp_reminder_offset_days) BETWEEN current_date AND current_date + 7),
    'next_7d_sin_telefono', (SELECT count(*) FROM payments p JOIN policies pol ON pol.id = p.policy_id JOIN programs pr ON pr.id = pol.program_id
                 JOIN clients c ON c.id = pol.client_id
                WHERE p.status = 'pending' AND pol.company_id IS NULL
                  AND (p.due_date - pr.whatsapp_reminder_offset_days) BETWEEN current_date AND current_date + 7
                  AND COALESCE(NULLIF(c.phone,''), NULLIF(c.payer_phone,'')) IS NULL)
  ) INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.set_whatsapp_reminders_enabled(_enabled boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n_stale int := 0;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _enabled THEN
    -- Al encender: lo que quedó encolado hace más de 3 días ya no se manda (sería un aviso atrasado).
    UPDATE notifications SET status = 'cancelled'
     WHERE channel = 'whatsapp' AND template_code = 'PAYMENT_REMINDER_WHATSAPP' AND status = 'pending'
       AND created_at < now() - interval '3 days';
    GET DIAGNOSTICS n_stale = ROW_COUNT;
  END IF;
  INSERT INTO system_config(key, value) VALUES ('integration.whatsapp.enabled', to_jsonb(_enabled))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO audit_log(user_id, entity_type, action, diff)
  VALUES (auth.uid(), 'system_config', 'WHATSAPP_REMINDERS_TOGGLED', jsonb_build_object('enabled', _enabled, 'stale_cancelled', n_stale));
  RETURN jsonb_build_object('enabled', _enabled, 'stale_cancelled', n_stale);
END $$;

-- Envío de prueba de la plantilla payment_reminder a un número (vía la función send-payment-reminders).
CREATE OR REPLACE FUNCTION public.whatsapp_test_send(_to text, _program_code text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id bigint; v_cmd text; v_url text; v_secret text;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(regexp_replace(coalesce(_to,''), '\D', '', 'g')) < 10 THEN RAISE EXCEPTION 'telefono_invalido'; END IF;
  -- Se reutilizan la URL y el secreto del cron de recordatorios (no se duplican en el código).
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'send-payment-reminders-daily';
  v_url := substring(v_cmd from $re$url := '([^']+)'$re$);
  v_secret := substring(v_cmd from $re$'x-cron-secret','([^']+)'$re$);
  IF v_url IS NULL OR v_secret IS NULL THEN RAISE EXCEPTION 'cron_no_configurado'; END IF;
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_secret),
    body := jsonb_build_object('test_send', jsonb_build_object('to', _to, 'program_code', upper(_program_code)))
  ) INTO v_id;
  INSERT INTO audit_log(user_id, entity_type, action, diff)
  VALUES (auth.uid(), 'system_config', 'WHATSAPP_TEST_SEND', jsonb_build_object('to', _to, 'program_code', upper(_program_code), 'request_id', v_id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_test_result(_request_id bigint)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('done', false); END IF;
  RETURN jsonb_build_object('done', true, 'status', r.status_code, 'body', left(coalesce(r.content::text, r.error_msg), 1500));
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_reminders_status() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_whatsapp_reminders_enabled(boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.whatsapp_test_send(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.whatsapp_test_result(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_reminders_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_reminders_enabled(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_test_send(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_test_result(bigint) TO authenticated;

-- 2) Recordatorios: teléfono del asegurado o, si no tiene, el del responsable de pago -------------
DO $patch$
DECLARE d text; d2 text;
BEGIN
  d := pg_get_functiondef('public.run_payment_housekeeping()'::regprocedure);
  IF position('payer_phone' IN d) > 0 THEN RETURN; END IF;
  d2 := replace(d, 'c.first_name, c.last_name, c.email, c.phone',
                   'c.first_name, c.last_name, c.email, COALESCE(NULLIF(c.phone,''''), NULLIF(c.payer_phone,'''')) AS phone');
  IF d2 = d THEN RAISE EXCEPTION 'run_payment_housekeeping: no se pudo aplicar el parche de teléfono'; END IF;
  EXECUTE d2;
END $patch$;

-- 3) Revertir el pago de un cobro de empresa ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_company_charge_payment(_charge_id uuid, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v public.company_charges; v_uid uuid := auth.uid(); v_status public.payment_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v FROM company_charges WHERE id = _charge_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'charge_not_found'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.has_program_role(v_uid, v.program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v.status <> 'paid' THEN RAISE EXCEPTION 'not_paid'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'motivo_requerido'; END IF;
  v_status := CASE WHEN v.due_date < current_date THEN 'overdue' ELSE 'pending' END;
  UPDATE company_charges SET status = v_status, paid_at = NULL, paid_amount = NULL, method = NULL, reference = NULL,
         notes = concat_ws(' | ', NULLIF(notes,''), 'Pago revertido: ' || trim(_reason)), updated_at = now()
   WHERE id = _charge_id;
  INSERT INTO audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, v.program_id, 'company_charge', _charge_id, 'COMPANY_CHARGE_PAYMENT_REVERTED',
          jsonb_build_object('company_id', v.company_id, 'period', v.period, 'previous', to_jsonb(v), 'reason', _reason));
  RETURN jsonb_build_object('ok', true, 'status', v_status);
END $$;
REVOKE ALL ON FUNCTION public.revert_company_charge_payment(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revert_company_charge_payment(uuid, text) TO authenticated;

-- 4) Vigencia de las altas: fecha de alta de la aseguradora → 1 año --------------------------
DO $patch$
DECLARE d text; d2 text;
BEGIN
  d := pg_get_functiondef('public.apply_certificate_assignments(uuid,text,jsonb,text,boolean)'::regprocedure);
  IF position('start_date = COALESCE' IN d) > 0 THEN RETURN; END IF;
  d2 := replace(d, $x$      policy_number = coalesce(nullif(_policy_number,''), policy_number),$x$,
                   $x$      policy_number = coalesce(nullif(_policy_number,''), policy_number),
      start_date = COALESCE(start_date, NULLIF(it->>'alta_date','')::date),
      end_date = COALESCE(end_date, (NULLIF(it->>'alta_date','')::date + interval '1 year')::date),$x$);
  IF d2 = d THEN RAISE EXCEPTION 'apply_certificate_assignments: no se pudo aplicar el parche de vigencia'; END IF;
  EXECUTE d2;
END $patch$;

-- 5) Portal: sin modo QA (el acceso actual es nombre + últimos 4 del teléfono; el modo QA
--    devolvía el código del flujo anterior en pantalla a quien lo pidiera).
UPDATE public.system_config SET value = 'false'::jsonb WHERE key = 'portal.qa_mode';
