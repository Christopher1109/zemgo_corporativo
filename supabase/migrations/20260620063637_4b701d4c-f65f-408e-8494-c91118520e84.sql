-- Fix pgcrypto search_path for portal RPCs
CREATE OR REPLACE FUNCTION public.resolve_portal_session(_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_client uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN RETURN NULL; END IF;
  v_hash := encode(digest(_token, 'sha256'), 'hex');
  SELECT client_id INTO v_client
  FROM public.portal_sessions
  WHERE token_hash = v_hash
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_client;
END $$;

CREATE OR REPLACE FUNCTION public.request_portal_access(_curp text, _full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client public.clients;
  v_code text;
  v_qa boolean;
  v_recent int;
  v_norm_in text;
  v_norm_db text;
BEGIN
  IF _curp IS NULL OR length(trim(_curp)) <> 18 THEN
    RAISE EXCEPTION 'curp_invalido';
  END IF;
  SELECT * INTO v_client FROM public.clients WHERE upper(curp) = upper(trim(_curp)) LIMIT 1;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'cliente_no_encontrado';
  END IF;

  v_norm_in := lower(unaccent(coalesce(_full_name, '')));
  v_norm_db := lower(unaccent(coalesce(v_client.first_name,'') || ' ' || coalesce(v_client.last_name,''))) ;
  IF position(split_part(v_norm_in, ' ', 1) IN v_norm_db) = 0
     AND position(coalesce(lower(unaccent(v_client.first_name)),'') IN v_norm_in) = 0 THEN
    RAISE EXCEPTION 'datos_no_coinciden';
  END IF;

  SELECT COUNT(*) INTO v_recent FROM public.portal_access_codes
  WHERE client_id = v_client.id AND created_at > now() - INTERVAL '15 minutes';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'demasiados_intentos';
  END IF;

  UPDATE public.portal_access_codes
    SET used_at = now()
  WHERE client_id = v_client.id AND used_at IS NULL AND expires_at > now();

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO public.portal_access_codes(client_id, code_hash, expires_at)
  VALUES (v_client.id, crypt(v_code, gen_salt('bf', 8)), now() + INTERVAL '10 minutes');

  INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
  VALUES ('client', v_client.id, 'PORTAL_CODE_REQUESTED', jsonb_build_object('curp', upper(_curp)));

  SELECT (value)::text::boolean INTO v_qa FROM public.system_config WHERE key='portal.qa_mode';

  RETURN jsonb_build_object(
    'client_id', v_client.id,
    'first_name', v_client.first_name,
    'qa_mode', COALESCE(v_qa, false),
    'dev_code', CASE WHEN COALESCE(v_qa, false) THEN v_code ELSE NULL END
  );
END $$;

CREATE OR REPLACE FUNCTION public.verify_portal_code(_client_id uuid, _code text, _ip text, _ua text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.portal_access_codes;
  v_token text;
  v_hash text;
  v_failed int;
BEGIN
  SELECT COUNT(*) INTO v_failed FROM public.portal_access_codes
  WHERE client_id = _client_id
    AND used_at IS NULL
    AND attempts >= 5
    AND created_at > now() - INTERVAL '15 minutes';
  IF v_failed > 0 THEN RAISE EXCEPTION 'bloqueado_temporalmente'; END IF;

  SELECT * INTO v_row FROM public.portal_access_codes
  WHERE client_id = _client_id AND used_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'codigo_no_valido'; END IF;

  IF v_row.code_hash <> crypt(_code, v_row.code_hash) THEN
    UPDATE public.portal_access_codes SET attempts = attempts + 1 WHERE id = v_row.id;
    INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
    VALUES ('client', _client_id, 'PORTAL_LOGIN_FAILED', jsonb_build_object('attempts', v_row.attempts + 1));
    RAISE EXCEPTION 'codigo_incorrecto';
  END IF;

  UPDATE public.portal_access_codes SET used_at = now() WHERE id = v_row.id;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.portal_sessions(client_id, token_hash, expires_at, ip_address, user_agent)
  VALUES (_client_id, v_hash, now() + INTERVAL '24 hours',
          NULLIF(_ip,'')::inet, NULLIF(_ua,''));

  INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
  VALUES ('client', _client_id, 'PORTAL_LOGIN_SUCCESS', jsonb_build_object());

  RETURN jsonb_build_object('token', v_token, 'expires_in', 86400);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_portal_session(_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_hash text;
BEGIN
  IF _token IS NULL THEN RETURN; END IF;
  v_hash := encode(digest(_token, 'sha256'), 'hex');
  UPDATE public.portal_sessions SET revoked_at = now() WHERE token_hash = v_hash AND revoked_at IS NULL;
END $$;