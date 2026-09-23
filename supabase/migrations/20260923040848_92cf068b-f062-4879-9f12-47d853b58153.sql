
-- 1) Allow (re)issuing a letter when none is active, except for rejected incidents
CREATE OR REPLACE FUNCTION public.issue_medical_pass(_incident_id uuid, _director_id uuid, _hospital text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_inc public.incidents;
  v_policy public.policies;
  v_client public.clients;
  v_program public.programs;
  v_director public.profiles;
  v_pass_id uuid;
  v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_inc FROM public.incidents WHERE id = _incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_inc.policy_id;
  SELECT * INTO v_client FROM public.clients WHERE id = v_inc.client_id;
  SELECT * INTO v_program FROM public.programs WHERE id = v_policy.program_id;

  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager','claims']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_inc.status = 'rejected' THEN
    RAISE EXCEPTION 'invalid_state:%', v_inc.status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.medical_passes
    WHERE incident_id = _incident_id AND revoked_at IS NULL AND valid_until > now()
  ) THEN
    RAISE EXCEPTION 'active_pass_exists';
  END IF;

  SELECT * INTO v_director FROM public.profiles WHERE id = _director_id;
  IF v_director.id IS NULL THEN RAISE EXCEPTION 'director_not_found'; END IF;
  IF NOT public.has_program_role(_director_id, v_policy.program_id,
      ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'director_not_authorized';
  END IF;

  v_snapshot := jsonb_build_object(
    'contracting_party', v_policy.contracting_party,
    'policy_number', v_policy.policy_number,
    'certificate_number', v_policy.certificate_number,
    'folio', v_policy.folio,
    'program_code', v_program.code,
    'program_name', v_program.name,
    'insured_name', trim(coalesce(v_client.first_name,'') || ' ' || coalesce(v_client.last_name,'')),
    'insured_dob', v_client.date_of_birth,
    'insured_curp', v_client.curp,
    'sum_insured', v_policy.sum_insured,
    'deductible', v_policy.deductible,
    'accident_date', v_inc.accident_date,
    'accident_time', v_inc.accident_time,
    'accident_description', v_inc.description,
    'hospital', COALESCE(_hospital, v_inc.hospital),
    'policy_valid_from', v_policy.start_date,
    'policy_valid_until', v_policy.end_date
  );

  INSERT INTO public.medical_passes(
    incident_id, policy_id, snapshot, valid_from, valid_until,
    director_signature_url, director_name, director_id, issued_by, created_by
  ) VALUES (
    _incident_id, v_policy.id, v_snapshot, now(), now() + INTERVAL '48 hours',
    v_director.signature_url, v_director.full_name, _director_id, v_user, v_user
  ) RETURNING id INTO v_pass_id;

  IF _hospital IS NOT NULL AND _hospital <> COALESCE(v_inc.hospital,'') THEN
    UPDATE public.incidents SET hospital = _hospital WHERE id = _incident_id;
  END IF;
  UPDATE public.incidents SET
    status='pass_issued', approved_at=now(), approved_by=v_user, updated_at=now()
  WHERE id = _incident_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'incident', _incident_id, 'PASS_ISSUED',
    jsonb_build_object('pass_id', v_pass_id, 'director_id', _director_id,
                       'valid_until', (now() + INTERVAL '48 hours')));

  RETURN v_pass_id;
END $fn$;

-- 2) Helper: create the letter row for an incident without requiring a logged-in CRM user
CREATE OR REPLACE FUNCTION public.ensure_accident_letter(_incident_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inc public.incidents;
  v_policy public.policies;
  v_client public.clients;
  v_program public.programs;
  v_director public.profiles;
  v_pass_id uuid;
BEGIN
  SELECT * INTO v_inc FROM public.incidents WHERE id = _incident_id;
  IF v_inc.id IS NULL THEN RETURN NULL; END IF;
  IF v_inc.status = 'rejected' THEN RETURN NULL; END IF;

  SELECT id INTO v_pass_id FROM public.medical_passes
   WHERE incident_id = _incident_id AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_pass_id IS NOT NULL THEN RETURN v_pass_id; END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = v_inc.policy_id;
  SELECT * INTO v_client FROM public.clients WHERE id = v_inc.client_id;
  SELECT * INTO v_program FROM public.programs WHERE id = v_policy.program_id;

  SELECT p.* INTO v_director
    FROM public.profiles p
    JOIN public.user_program_access upa ON upa.user_id = p.id
   WHERE upa.program_id = v_policy.program_id
     AND upa.role IN ('admin','manager')
   ORDER BY (p.signature_url IS NULL), p.created_at
   LIMIT 1;

  INSERT INTO public.medical_passes(
    incident_id, policy_id, snapshot, valid_from, valid_until,
    director_signature_url, director_name, director_id, issued_by, created_by
  ) VALUES (
    _incident_id, v_policy.id,
    jsonb_build_object(
      'contracting_party', v_policy.contracting_party,
      'policy_number', v_policy.policy_number,
      'certificate_number', v_policy.certificate_number,
      'folio', v_policy.folio,
      'program_code', v_program.code,
      'program_name', v_program.name,
      'insured_name', trim(coalesce(v_client.first_name,'') || ' ' || coalesce(v_client.last_name,'')),
      'insured_dob', v_client.date_of_birth,
      'insured_curp', v_client.curp,
      'sum_insured', v_policy.sum_insured,
      'deductible', v_policy.deductible,
      'accident_date', v_inc.accident_date,
      'accident_time', v_inc.accident_time,
      'accident_description', v_inc.description,
      'hospital', v_inc.hospital,
      'policy_valid_from', v_policy.start_date,
      'policy_valid_until', v_policy.end_date
    ),
    COALESCE(v_inc.reported_at, now()), COALESCE(v_inc.reported_at, now()) + INTERVAL '48 hours',
    v_director.signature_url, v_director.full_name, v_director.id, v_director.id, v_director.id
  ) RETURNING id INTO v_pass_id;

  INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
  VALUES (v_policy.program_id, 'incident', _incident_id, 'PASS_ISSUED',
    jsonb_build_object('pass_id', v_pass_id, 'auto', true));

  RETURN v_pass_id;
END $fn$;

REVOKE ALL ON FUNCTION public.ensure_accident_letter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_accident_letter(uuid) TO authenticated, service_role;

-- 3) Portal reports now generate the letter row automatically
CREATE OR REPLACE FUNCTION public.report_portal_incident(
  _token text, _policy_id uuid, _accident_date date, _accident_time time without time zone,
  _location text, _description text, _hospital text, _hospital_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_policy public.policies;
  v_id uuid;
  v_occurred timestamptz;
  v_hospital_name text := _hospital;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = _policy_id AND client_id = v_client_id;
  IF v_policy.id IS NULL THEN RAISE EXCEPTION 'poliza_no_encontrada'; END IF;
  IF v_policy.status <> 'active' THEN RAISE EXCEPTION 'poliza_inactiva'; END IF;
  IF _accident_date IS NULL OR _accident_date > CURRENT_DATE THEN RAISE EXCEPTION 'fecha_invalida'; END IF;
  IF _description IS NULL OR length(trim(_description)) < 20 THEN RAISE EXCEPTION 'descripcion_muy_corta'; END IF;

  IF _hospital_id IS NOT NULL THEN
    SELECT name INTO v_hospital_name FROM public.hospitals
      WHERE id = _hospital_id AND program_id = v_policy.program_id AND is_active = true;
    IF v_hospital_name IS NULL THEN RAISE EXCEPTION 'hospital_no_valido'; END IF;
  END IF;

  v_occurred := (_accident_date::text || ' ' || COALESCE(_accident_time::text, '00:00:00'))::timestamptz;

  INSERT INTO public.incidents(
    policy_id, client_id, occurred_at, accident_date, accident_time,
    location_description, hospital, hospital_id, description,
    status, reported_at, approved_at, metadata
  ) VALUES (
    _policy_id, v_client_id, v_occurred, _accident_date, _accident_time,
    _location, v_hospital_name, _hospital_id, _description,
    'pass_issued', now(), now(),
    jsonb_build_object('reported_from','portal','auto_authorized', true)
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
  VALUES (v_policy.program_id, 'incident', v_id, 'INCIDENT_AUTO_AUTHORIZED_PORTAL',
    jsonb_build_object('hospital', v_hospital_name, 'hospital_id', _hospital_id,
                       'accident_date', _accident_date));

  PERFORM public.ensure_accident_letter(v_id);

  RETURN v_id;
END $fn$;

-- 4) Backfill letters for incidents already reported
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.incidents WHERE status <> 'rejected' LOOP
    PERFORM public.ensure_accident_letter(r.id);
  END LOOP;
END $$;
