-- Aviso de cliente nuevo: correos distintos por programa (nov-2026).
--
-- system_config 'notify.new_client.emails_by_program' = {"ABC": [...], "FUTCARE": [...], "MCV": [...]}
-- Si un programa no tiene correos propios, se usa la lista general
-- 'notify.new_client.emails' como respaldo.

INSERT INTO public.system_config(key, value, description) VALUES
  ('notify.new_client.emails_by_program', '{}'::jsonb, 'Correos que reciben el aviso de cliente nuevo, por código de programa')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.new_client_notify_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  RETURN jsonb_build_object(
    'enabled', COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.enabled') = 'true'::jsonb, false),
    'emails', COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.emails'), '[]'::jsonb),
    'emails_by_program', COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.emails_by_program'), '{}'::jsonb),
    'programs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'name', name) ORDER BY code), '[]'::jsonb) FROM programs),
    'sent_30d', (SELECT count(*) FROM new_client_notifications WHERE created_at > now() - interval '30 days')
  );
END $$;

-- Guarda la lista de correos de un programa (lista vacía = usar la general).
CREATE OR REPLACE FUNCTION public.set_new_client_program_emails(_program_code text, _emails text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_emails jsonb; v_map jsonb; v_code text := upper(trim(_program_code));
BEGIN
  IF NOT public.can_manage_settings(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM programs WHERE code = v_code) THEN RAISE EXCEPTION 'programa_invalido'; END IF;
  SELECT COALESCE(jsonb_agg(DISTINCT lower(trim(e))), '[]'::jsonb) INTO v_emails
    FROM unnest(COALESCE(_emails, ARRAY[]::text[])) e
   WHERE trim(e) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  v_map := COALESCE((SELECT value FROM system_config WHERE key = 'notify.new_client.emails_by_program'), '{}'::jsonb);
  v_map := CASE WHEN jsonb_array_length(v_emails) = 0 THEN v_map - v_code ELSE jsonb_set(v_map, ARRAY[v_code], v_emails) END;
  INSERT INTO system_config(key, value) VALUES ('notify.new_client.emails_by_program', v_map)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO audit_log(user_id, entity_type, action, diff)
  VALUES (auth.uid(), 'system_config', 'NEW_CLIENT_NOTIFY_PROGRAM_EMAILS', jsonb_build_object('program', v_code, 'emails', v_emails));
  RETURN v_map;
END $$;

-- Correo de prueba, opcionalmente para un programa (usa los correos de ese programa).
DROP FUNCTION IF EXISTS public.new_client_notify_test();
CREATE OR REPLACE FUNCTION public.new_client_notify_test(_program_code text DEFAULT NULL)
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
    body := jsonb_build_object('test', true, 'program_code', upper(nullif(trim(_program_code), '')))
  ) INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.set_new_client_program_emails(text, text[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.new_client_notify_test(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_new_client_program_emails(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.new_client_notify_test(text) TO authenticated;
