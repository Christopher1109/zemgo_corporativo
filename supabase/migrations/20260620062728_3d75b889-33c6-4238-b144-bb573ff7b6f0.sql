
-- =========================================================
-- PORTAL DEL CLIENTE - infraestructura
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------- portal_access_codes ----------
CREATE TABLE public.portal_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pac_client ON public.portal_access_codes(client_id);
CREATE INDEX idx_pac_expires ON public.portal_access_codes(expires_at);

GRANT ALL ON public.portal_access_codes TO service_role;
ALTER TABLE public.portal_access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_pac" ON public.portal_access_codes FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ---------- portal_sessions ----------
CREATE TABLE public.portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ps_client ON public.portal_sessions(client_id);
CREATE INDEX idx_ps_expires ON public.portal_sessions(expires_at);

GRANT ALL ON public.portal_sessions TO service_role;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_ps" ON public.portal_sessions FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ---------- sheet_sync_log ----------
CREATE TABLE public.sheet_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  rows_detected int DEFAULT 0,
  rows_imported int DEFAULT 0,
  rows_skipped int DEFAULT 0,
  status text NOT NULL DEFAULT 'started',
  error text
);
GRANT ALL ON public.sheet_sync_log TO service_role;
ALTER TABLE public.sheet_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_ssl" ON public.sheet_sync_log FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ---------- system_config seeds ----------
INSERT INTO public.system_config(key, value) VALUES
  ('portal.qa_mode', to_jsonb(true)),
  ('whatsapp.enabled', to_jsonb(false)),
  ('whatsapp.provider', to_jsonb('meta_cloud_api'::text)),
  ('whatsapp.phone_number_id', to_jsonb(''::text)),
  ('whatsapp.access_token', to_jsonb(''::text)),
  ('whatsapp.template_welcome', to_jsonb(''::text)),
  ('whatsapp.template_otp', to_jsonb(''::text)),
  ('whatsapp.template_payment_reminder', to_jsonb(''::text)),
  ('whatsapp.template_incident_update', to_jsonb(''::text)),
  ('google_sheets.enabled', to_jsonb(false)),
  ('google_sheets.service_account_email', to_jsonb(''::text)),
  ('google_sheets.service_account_key', to_jsonb(''::text)),
  ('google_sheets.sheet_id', to_jsonb(''::text)),
  ('google_sheets.last_synced_at', to_jsonb(''::text))
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- RPCs del portal
-- =========================================================

-- Helper: resolver sesión por token plano (devuelve client_id o null)
CREATE OR REPLACE FUNCTION public.resolve_portal_session(_token text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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

-- Solicitar acceso al portal
CREATE OR REPLACE FUNCTION public.request_portal_access(_curp text, _full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Comparación tolerante de nombres
  v_norm_in := lower(unaccent(coalesce(_full_name, '')));
  v_norm_db := lower(unaccent(coalesce(v_client.first_name,'') || ' ' || coalesce(v_client.last_name,'')));
  IF position(split_part(v_norm_in, ' ', 1) IN v_norm_db) = 0
     AND position(coalesce(lower(unaccent(v_client.first_name)),'') IN v_norm_in) = 0 THEN
    RAISE EXCEPTION 'datos_no_coinciden';
  END IF;

  -- Rate limit: máximo 5 códigos en 15 minutos
  SELECT COUNT(*) INTO v_recent FROM public.portal_access_codes
  WHERE client_id = v_client.id AND created_at > now() - INTERVAL '15 minutes';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'demasiados_intentos';
  END IF;

  -- Invalidar códigos anteriores no usados
  UPDATE public.portal_access_codes
    SET used_at = now()
  WHERE client_id = v_client.id AND used_at IS NULL AND expires_at > now();

  -- Generar código
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

-- Verificar código y crear sesión
CREATE OR REPLACE FUNCTION public.verify_portal_code(_client_id uuid, _code text, _ip text, _ua text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.portal_access_codes;
  v_token text;
  v_hash text;
  v_failed int;
BEGIN
  -- Bloqueo si demasiados fallos recientes
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

  -- Generar token de sesión (32 bytes hex)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.portal_sessions(client_id, token_hash, expires_at, ip_address, user_agent)
  VALUES (_client_id, v_hash, now() + INTERVAL '24 hours',
          NULLIF(_ip,'')::inet, NULLIF(_ua,''));

  INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
  VALUES ('client', _client_id, 'PORTAL_LOGIN_SUCCESS', jsonb_build_object());

  RETURN jsonb_build_object('token', v_token, 'expires_in', 86400);
END $$;

-- Revocar sesión
CREATE OR REPLACE FUNCTION public.revoke_portal_session(_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_hash text;
BEGIN
  IF _token IS NULL THEN RETURN; END IF;
  v_hash := encode(digest(_token, 'sha256'), 'hex');
  UPDATE public.portal_sessions SET revoked_at = now() WHERE token_hash = v_hash AND revoked_at IS NULL;
END $$;

-- Dashboard
CREATE OR REPLACE FUNCTION public.get_portal_dashboard(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_client public.clients;
  v_policies jsonb;
  v_next_payment jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'folio', p.folio, 'status', p.status,
    'start_date', p.start_date, 'end_date', p.end_date,
    'premium', p.premium,
    'program', jsonb_build_object('id', pr.id, 'code', pr.code, 'name', pr.name, 'color', pr.color_primary)
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_policies
  FROM public.policies p
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE p.client_id = v_client_id;

  SELECT to_jsonb(np) INTO v_next_payment FROM (
    SELECT pay.id, pay.amount, pay.due_date, pay.status, pol.folio
    FROM public.payments pay
    JOIN public.policies pol ON pol.id = pay.policy_id
    WHERE pol.client_id = v_client_id AND pay.status IN ('pending','overdue')
    ORDER BY pay.due_date ASC LIMIT 1
  ) np;

  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'first_name', v_client.first_name, 'last_name', v_client.last_name, 'email', v_client.email, 'phone', v_client.phone),
    'policies', v_policies,
    'next_payment', v_next_payment
  );
END $$;

-- Pólizas
CREATE OR REPLACE FUNCTION public.get_portal_policies(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_data jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'folio', p.folio, 'status', p.status,
    'start_date', p.start_date, 'end_date', p.end_date,
    'sum_insured', p.sum_insured, 'deductible', p.deductible, 'premium', p.premium,
    'contracting_party', p.contracting_party,
    'program', jsonb_build_object('id', pr.id, 'code', pr.code, 'name', pr.name, 'color', pr.color_primary),
    'beneficiaries', (SELECT COALESCE(jsonb_agg(jsonb_build_object('full_name', b.full_name, 'relationship', b.relationship, 'percentage', b.percentage)), '[]'::jsonb) FROM public.beneficiaries b WHERE b.policy_id = p.id),
    'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pay.id, 'amount', pay.amount, 'due_date', pay.due_date, 'status', pay.status, 'paid_at', pay.paid_at) ORDER BY pay.due_date DESC), '[]'::jsonb) FROM public.payments pay WHERE pay.policy_id = p.id)
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_data
  FROM public.policies p
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE p.client_id = v_client_id;
  RETURN v_data;
END $$;

-- Pagos
CREATE OR REPLACE FUNCTION public.get_portal_payments(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_data jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pay.id, 'amount', pay.amount, 'due_date', pay.due_date, 'status', pay.status,
    'paid_at', pay.paid_at, 'paid_amount', pay.paid_amount,
    'bank_reference', pay.bank_reference, 'bank_reference_expires_at', pay.bank_reference_expires_at,
    'policy', jsonb_build_object('id', pol.id, 'folio', pol.folio, 'program_code', pr.code, 'color', pr.color_primary)
  ) ORDER BY (CASE pay.status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END), pay.due_date ASC), '[]'::jsonb)
  INTO v_data
  FROM public.payments pay
  JOIN public.policies pol ON pol.id = pay.policy_id
  JOIN public.programs pr ON pr.id = pol.program_id
  WHERE pol.client_id = v_client_id;
  RETURN v_data;
END $$;

-- Siniestros
CREATE OR REPLACE FUNCTION public.get_portal_incidents(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_data jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'status', i.status, 'accident_date', i.accident_date, 'accident_time', i.accident_time,
    'location', i.location_description, 'hospital', i.hospital, 'description', i.description,
    'reported_at', i.reported_at,
    'policy', jsonb_build_object('id', pol.id, 'folio', pol.folio, 'program_code', pr.code),
    'has_active_pass', EXISTS (SELECT 1 FROM public.medical_passes mp WHERE mp.incident_id = i.id AND mp.revoked_at IS NULL AND mp.valid_until > now()),
    'pass_pdf_url', (SELECT mp.pdf_url FROM public.medical_passes mp WHERE mp.incident_id = i.id AND mp.revoked_at IS NULL ORDER BY mp.created_at DESC LIMIT 1)
  ) ORDER BY i.reported_at DESC), '[]'::jsonb)
  INTO v_data
  FROM public.incidents i
  JOIN public.policies pol ON pol.id = i.policy_id
  JOIN public.programs pr ON pr.id = pol.program_id
  WHERE i.client_id = v_client_id;
  RETURN v_data;
END $$;

-- Reportar siniestro desde portal
CREATE OR REPLACE FUNCTION public.report_portal_incident(
  _token text, _policy_id uuid, _accident_date date, _accident_time time,
  _location text, _description text, _hospital text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_policy public.policies;
  v_id uuid;
  v_occurred timestamptz;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = _policy_id AND client_id = v_client_id;
  IF v_policy.id IS NULL THEN RAISE EXCEPTION 'poliza_no_encontrada'; END IF;
  IF v_policy.status <> 'active' THEN RAISE EXCEPTION 'poliza_inactiva'; END IF;
  IF _accident_date IS NULL OR _accident_date > CURRENT_DATE THEN RAISE EXCEPTION 'fecha_invalida'; END IF;
  IF _description IS NULL OR length(trim(_description)) < 20 THEN RAISE EXCEPTION 'descripcion_muy_corta'; END IF;

  v_occurred := (_accident_date::text || ' ' || COALESCE(_accident_time::text, '00:00:00'))::timestamptz;

  INSERT INTO public.incidents(
    policy_id, client_id, occurred_at, accident_date, accident_time,
    location_description, hospital, description, status, reported_at, metadata
  ) VALUES (
    _policy_id, v_client_id, v_occurred, _accident_date, _accident_time,
    _location, _hospital, _description, 'reported', now(),
    jsonb_build_object('reported_from','portal')
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
  VALUES (v_policy.program_id, 'incident', v_id, 'INCIDENT_REPORTED_PORTAL',
    jsonb_build_object('hospital', _hospital, 'accident_date', _accident_date));

  RETURN v_id;
END $$;

-- Actualizar perfil
CREATE OR REPLACE FUNCTION public.update_portal_profile(_token text, _changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_diff jsonb := '{}'::jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;

  UPDATE public.clients SET
    phone   = COALESCE(_changes->>'phone', phone),
    email   = COALESCE(_changes->>'email', email),
    street  = COALESCE(_changes->>'street', street),
    number  = COALESCE(_changes->>'number', number),
    colonia = COALESCE(_changes->>'colonia', colonia),
    city    = COALESCE(_changes->>'city', city),
    state   = COALESCE(_changes->>'state', state),
    zip     = COALESCE(_changes->>'zip', zip),
    updated_at = now()
  WHERE id = v_client_id;

  INSERT INTO public.audit_log(entity_type, entity_id, action, diff)
  VALUES ('client', v_client_id, 'CLIENT_SELF_UPDATED', _changes);

  -- Notificar al equipo
  INSERT INTO public.notifications(channel, recipient, template_code, payload, status)
  VALUES ('in_app', 'team', 'CLIENT_PROFILE_UPDATED',
    jsonb_build_object('client_id', v_client_id, 'changes', _changes), 'pending');

  RETURN jsonb_build_object('ok', true);
END $$;
