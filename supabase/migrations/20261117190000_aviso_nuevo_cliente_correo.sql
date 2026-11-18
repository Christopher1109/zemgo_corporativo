-- Aviso por correo al equipo cuando entra un cliente nuevo (nov-2026).
--
-- "Cliente nuevo" = el primer pago aceptado (status 'paid') de un cliente
-- individual. Los asegurados de empresas / torneos (policies.company_id) no
-- generan aviso, porque ahí paga la empresa o el encargado.
--
-- Flujo: trigger en payments → registra el aviso en new_client_notifications
-- (uno por cliente, nunca se repite) → llama por pg_net a la edge function
-- notify-new-client, que arma y manda el correo con Resend.
--
-- Destinatarios y encendido/apagado: system_config
--   'notify.new_client.enabled' → true / false
--   'notify.new_client.emails'  → ["persona@semgo.mx", ...]

-- 1) Bitácora de avisos (garantiza un solo correo por cliente) ---------------
CREATE TABLE IF NOT EXISTS public.new_client_notifications (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  request_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.new_client_notifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.new_client_notifications TO service_role;

-- Valores iniciales (encendido, sin destinatarios hasta que se capturen).
INSERT INTO public.system_config(key, value, description) VALUES
  ('notify.new_client.enabled', 'true'::jsonb, 'Aviso por correo al equipo cuando un cliente nuevo hace su primer pago'),
  ('notify.new_client.emails', '[]'::jsonb, 'Correos que reciben el aviso de cliente nuevo')
ON CONFLICT (key) DO NOTHING;

-- 2) URL + secreto de las edge functions -------------------------------------
-- Se reutilizan los del cron de recordatorios (mismo patrón que whatsapp_test_send),
-- así no se escribe ningún secreto en las migraciones.
CREATE OR REPLACE FUNCTION public._edge_function_target(_fn text)
 RETURNS TABLE(url text, secret text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cmd text; v_url text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'send-payment-reminders-daily';
  v_url := substring(v_cmd from $re$url := '([^']+)'$re$);
  url := replace(v_url, 'send-payment-reminders', _fn);
  secret := substring(v_cmd from $re$'x-cron-secret','([^']+)'$re$);
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public._edge_function_target(text) FROM public, anon, authenticated;

-- 3) Trigger en pagos ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_client_on_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_client uuid;
  v_company uuid;
  v_inserted int;
  v_target record;
  v_req bigint;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
    RETURN NEW;
  END IF;
  IF COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.enabled'), 'false'::jsonb) <> 'true'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT pol.client_id, pol.company_id INTO v_client, v_company
    FROM policies pol WHERE pol.id = NEW.policy_id;
  IF v_client IS NULL OR v_company IS NOT NULL OR NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Solo si es el primer pago aceptado de ese cliente (en cualquiera de sus pólizas).
  IF EXISTS (
    SELECT 1 FROM payments p JOIN policies pol ON pol.id = p.policy_id
     WHERE pol.client_id = v_client AND p.status = 'paid' AND p.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO new_client_notifications(client_id, payment_id) VALUES (v_client, NEW.id)
  ON CONFLICT (client_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN NEW; END IF;

  -- Un fallo al avisar nunca debe impedir que se registre el pago.
  BEGIN
    SELECT * INTO v_target FROM public._edge_function_target('notify-new-client');
    IF v_target.url IS NOT NULL AND v_target.secret IS NOT NULL THEN
      SELECT net.http_post(
        url := v_target.url,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_target.secret),
        body := jsonb_build_object('payment_id', NEW.id)
      ) INTO v_req;
      UPDATE new_client_notifications SET request_id = v_req WHERE client_id = v_client;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_new_client_on_payment: %', SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_new_client ON public.payments;
CREATE TRIGGER trg_notify_new_client
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_client_on_payment();

-- 4) RPCs para la tarjeta de Configuración -------------------------------------
CREATE OR REPLACE FUNCTION public.new_client_notify_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  RETURN jsonb_build_object(
    'enabled', COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.enabled') = 'true'::jsonb, false),
    'emails', COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.emails'), '[]'::jsonb),
    'sent_30d', (SELECT count(*) FROM new_client_notifications WHERE created_at > now() - interval '30 days')
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_new_client_notify(_enabled boolean, _emails text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_emails jsonb;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(DISTINCT lower(trim(e))), '[]'::jsonb) INTO v_emails
    FROM unnest(COALESCE(_emails, ARRAY[]::text[])) e
   WHERE trim(e) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  INSERT INTO system_config(key, value) VALUES ('notify.new_client.enabled', to_jsonb(_enabled))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO system_config(key, value) VALUES ('notify.new_client.emails', v_emails)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO audit_log(user_id, entity_type, action, diff)
  VALUES (auth.uid(), 'system_config', 'NEW_CLIENT_NOTIFY_UPDATED', jsonb_build_object('enabled', _enabled, 'emails', v_emails));
  RETURN jsonb_build_object('enabled', _enabled, 'emails', v_emails);
END $$;

-- Correo de prueba (devuelve el id de la petición para consultar el resultado).
CREATE OR REPLACE FUNCTION public.new_client_notify_test()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_target record; v_id bigint;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_target FROM public._edge_function_target('notify-new-client');
  IF v_target.url IS NULL OR v_target.secret IS NULL THEN RAISE EXCEPTION 'cron_no_configurado'; END IF;
  SELECT net.http_post(
    url := v_target.url,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_target.secret),
    body := jsonb_build_object('test', true)
  ) INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.new_client_notify_test_result(_request_id bigint)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT status_code, content, error_msg INTO r FROM net._http_response WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('done', false); END IF;
  RETURN jsonb_build_object('done', true, 'status', r.status_code, 'body', left(coalesce(r.content::text, r.error_msg), 1500));
END $$;

REVOKE ALL ON FUNCTION public.new_client_notify_status() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_new_client_notify(boolean, text[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.new_client_notify_test() FROM public, anon;
REVOKE ALL ON FUNCTION public.new_client_notify_test_result(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.new_client_notify_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_new_client_notify(boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.new_client_notify_test() TO authenticated;
GRANT EXECUTE ON FUNCTION public.new_client_notify_test_result(bigint) TO authenticated;
