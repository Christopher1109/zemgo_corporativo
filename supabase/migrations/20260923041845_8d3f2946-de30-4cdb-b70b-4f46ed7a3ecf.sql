CREATE OR REPLACE FUNCTION public.ensure_accident_letter(_incident_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inc public.incidents;
  v_policy public.policies;
  v_client public.clients;
  v_program public.programs;
  v_director public.profiles;
  v_hospital text;
  v_contracting text;
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

  SELECT COALESCE(NULLIF(v_inc.hospital,''), h.name) INTO v_hospital
    FROM (SELECT 1) x LEFT JOIN public.hospitals h ON h.id = v_inc.hospital_id;

  v_contracting := COALESCE(
    (SELECT ct.full_name FROM public.contractors ct WHERE ct.id = v_policy.contractor_id),
    NULLIF(v_policy.contracting_party,''),
    trim(concat_ws(' ', v_client.first_name, v_client.last_name))
  );

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
      'contracting_party', v_contracting,
      'policy_number', COALESCE(v_program.policy_number, v_policy.policy_number),
      'certificate_number', COALESCE(v_policy.certificate_number, v_policy.folio),
      'folio', v_policy.folio,
      'program_code', v_program.code,
      'program_name', v_program.name,
      'insured_name', trim(concat_ws(' ', v_client.first_name, v_client.last_name)),
      'insured_dob', v_client.date_of_birth,
      'insured_curp', v_client.curp,
      'sum_insured', v_policy.sum_insured,
      'deductible', v_policy.deductible,
      'accident_date', v_inc.accident_date,
      'accident_time', v_inc.accident_time,
      'accident_description', v_inc.description,
      'accident_location', v_inc.location_description,
      'hospital', v_hospital,
      'reported_at', v_inc.reported_at,
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
END $function$;

CREATE OR REPLACE FUNCTION public.issue_medical_pass(_incident_id uuid, _director_id uuid, _hospital text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_inc public.incidents;
  v_policy public.policies;
  v_client public.clients;
  v_program public.programs;
  v_director public.profiles;
  v_hospital text;
  v_contracting text;
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

  SELECT COALESCE(NULLIF(_hospital,''), NULLIF(v_inc.hospital,''), h.name) INTO v_hospital
    FROM (SELECT 1) x LEFT JOIN public.hospitals h ON h.id = v_inc.hospital_id;

  v_contracting := COALESCE(
    (SELECT ct.full_name FROM public.contractors ct WHERE ct.id = v_policy.contractor_id),
    NULLIF(v_policy.contracting_party,''),
    trim(concat_ws(' ', v_client.first_name, v_client.last_name))
  );

  v_snapshot := jsonb_build_object(
    'contracting_party', v_contracting,
    'policy_number', COALESCE(v_program.policy_number, v_policy.policy_number),
    'certificate_number', COALESCE(v_policy.certificate_number, v_policy.folio),
    'folio', v_policy.folio,
    'program_code', v_program.code,
    'program_name', v_program.name,
    'insured_name', trim(concat_ws(' ', v_client.first_name, v_client.last_name)),
    'insured_dob', v_client.date_of_birth,
    'insured_curp', v_client.curp,
    'sum_insured', v_policy.sum_insured,
    'deductible', v_policy.deductible,
    'accident_date', v_inc.accident_date,
    'accident_time', v_inc.accident_time,
    'accident_description', v_inc.description,
    'accident_location', v_inc.location_description,
    'hospital', v_hospital,
    'reported_at', v_inc.reported_at,
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
END $function$;

UPDATE public.medical_passes mp
SET snapshot = mp.snapshot || jsonb_build_object(
      'accident_location', i.location_description,
      'accident_description', i.description,
      'accident_date', i.accident_date,
      'accident_time', i.accident_time,
      'hospital', COALESCE(NULLIF(i.hospital,''), h.name, mp.snapshot->>'hospital'),
      'reported_at', i.reported_at,
      'policy_number', COALESCE(pr.policy_number, p.policy_number),
      'certificate_number', COALESCE(p.certificate_number, p.folio),
      'contracting_party', COALESCE(
        (SELECT ct.full_name FROM public.contractors ct WHERE ct.id = p.contractor_id),
        NULLIF(p.contracting_party,''),
        trim(concat_ws(' ', c.first_name, c.last_name))
      )
    )
FROM public.incidents i
JOIN public.policies p ON p.id = i.policy_id
JOIN public.clients c ON c.id = i.client_id
JOIN public.programs pr ON pr.id = p.program_id
LEFT JOIN public.hospitals h ON h.id = i.hospital_id
WHERE i.id = mp.incident_id;