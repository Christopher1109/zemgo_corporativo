
-- Tabla de intentos por CURP
CREATE TABLE public.portal_login_attempts (
  curp text PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_login_attempts TO service_role;
ALTER TABLE public.portal_login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_portal_login_attempts" ON public.portal_login_attempts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Tabla de intentos por IP
CREATE TABLE public.portal_login_attempts_by_ip (
  ip inet PRIMARY KEY,
  failed_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_login_attempts_by_ip TO service_role;
ALTER TABLE public.portal_login_attempts_by_ip ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_portal_login_attempts_by_ip" ON public.portal_login_attempts_by_ip
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Función de verificación de acceso al portal (CURP + últimos 4 del teléfono)
CREATE OR REPLACE FUNCTION public.verify_portal_login(
  _curp text, _phone_last4 text, _ip text, _ua text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_curp text;
  v_ip inet;
  v_client public.clients;
  v_client_phone_last4 text;
  v_token text;
  v_hash text;
  v_curp_row public.portal_login_attempts;
  v_ip_row public.portal_login_attempts_by_ip;
  v_match boolean := false;
BEGIN
  -- Normalizar CURP
  v_curp := upper(btrim(coalesce(_curp, '')));
  IF length(v_curp) <> 18 THEN
    RAISE EXCEPTION 'datos_no_coinciden';
  END IF;

  -- Normalizar IP
  BEGIN
    v_ip := NULLIF(_ip, '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  -- Verificar bloqueo por IP
  IF v_ip IS NOT NULL THEN
    SELECT * INTO v_ip_row FROM public.portal_login_attempts_by_ip WHERE ip = v_ip;
    IF v_ip_row.blocked_until IS NOT NULL AND v_ip_row.blocked_until > now() THEN
      RAISE EXCEPTION 'bloqueado_temporalmente';
    END IF;
  END IF;

  -- Verificar bloqueo por CURP
  SELECT * INTO v_curp_row FROM public.portal_login_attempts WHERE curp = v_curp;
  IF v_curp_row.blocked_until IS NOT NULL AND v_curp_row.blocked_until > now() THEN
    RAISE EXCEPTION 'bloqueado_temporalmente';
  END IF;

  -- Validar formato de últimos 4 dígitos
  IF _phone_last4 IS NULL OR _phone_last4 !~ '^[0-9]{4}$' THEN
    v_match := false;
  ELSE
    -- Buscar cliente
    SELECT * INTO v_client FROM public.clients WHERE upper(curp) = v_curp LIMIT 1;
    IF v_client.id IS NOT NULL AND v_client.phone IS NOT NULL THEN
      v_client_phone_last4 := right(regexp_replace(v_client.phone, '[^0-9]', '', 'g'), 4);
      IF v_client_phone_last4 = _phone_last4 THEN
        v_match := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_match THEN
    -- Incrementar contador por CURP
    INSERT INTO public.portal_login_attempts (curp, failed_count, last_attempt_at, blocked_until, updated_at)
    VALUES (v_curp, 1, now(),
            CASE WHEN 1 >= 5 THEN now() + INTERVAL '15 minutes' ELSE NULL END,
            now())
    ON CONFLICT (curp) DO UPDATE SET
      failed_count = public.portal_login_attempts.failed_count + 1,
      last_attempt_at = now(),
      blocked_until = CASE
        WHEN public.portal_login_attempts.failed_count + 1 >= 5
        THEN now() + INTERVAL '15 minutes'
        ELSE public.portal_login_attempts.blocked_until
      END,
      updated_at = now();

    -- Incrementar contador por IP
    IF v_ip IS NOT NULL THEN
      INSERT INTO public.portal_login_attempts_by_ip (ip, failed_count, last_attempt_at, blocked_until, updated_at)
      VALUES (v_ip, 1, now(), NULL, now())
      ON CONFLICT (ip) DO UPDATE SET
        failed_count = CASE
          WHEN public.portal_login_attempts_by_ip.last_attempt_at < now() - INTERVAL '15 minutes'
          THEN 1
          ELSE public.portal_login_attempts_by_ip.failed_count + 1
        END,
        last_attempt_at = now(),
        blocked_until = CASE
          WHEN (CASE
                  WHEN public.portal_login_attempts_by_ip.last_attempt_at < now() - INTERVAL '15 minutes'
                  THEN 1
                  ELSE public.portal_login_attempts_by_ip.failed_count + 1
                END) >= 10
          THEN now() + INTERVAL '15 minutes'
          ELSE public.portal_login_attempts_by_ip.blocked_until
        END,
        updated_at = now();
    END IF;

    INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
    VALUES ('portal_login', NULL, 'PORTAL_LOGIN_FAILED',
            jsonb_build_object('curp', v_curp, 'ip', _ip));

    RAISE EXCEPTION 'datos_no_coinciden';
  END IF;

  -- Éxito: resetear contadores
  DELETE FROM public.portal_login_attempts WHERE curp = v_curp;

  -- Crear sesión (misma lógica que verify_portal_code)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.portal_sessions(client_id, token_hash, expires_at, ip_address, user_agent)
  VALUES (v_client.id, v_hash, now() + INTERVAL '24 hours', v_ip, NULLIF(_ua, ''));

  INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
  VALUES ('client', v_client.id, 'PORTAL_LOGIN_SUCCESS',
          jsonb_build_object('method', 'curp_phone4'));

  RETURN jsonb_build_object('token', v_token, 'expires_in', 86400);
END $$;

REVOKE ALL ON FUNCTION public.verify_portal_login(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_portal_login(text, text, text, text) TO service_role;
