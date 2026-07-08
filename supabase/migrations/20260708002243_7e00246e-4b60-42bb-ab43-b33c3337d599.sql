
-- Bloque 7: Siniestros del portal se autorizan automáticamente + RPC de datos
-- para generar la "Carta Aviso de Accidente" HIR.

-- 1) Reemplazar report_portal_incident: setea status='pass_issued' (autorizado)
--    directamente, sin flujo de revisión del despacho.
CREATE OR REPLACE FUNCTION public.report_portal_incident(
  _token text, _policy_id uuid, _accident_date date, _accident_time time without time zone,
  _location text, _description text, _hospital text, _hospital_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  RETURN v_id;
END $function$;

-- 2) Nueva RPC: devuelve todos los datos del siniestro necesarios para
--    imprimir la Carta Aviso de Accidente, validando la sesión del portal.
CREATE OR REPLACE FUNCTION public.get_portal_accident_notice(_token text, _incident_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_data jsonb;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT jsonb_build_object(
    'incident', jsonb_build_object(
      'id', i.id, 'accident_date', i.accident_date, 'accident_time', i.accident_time,
      'description', i.description, 'hospital', i.hospital, 'location', i.location_description,
      'reported_at', i.reported_at
    ),
    'policy', jsonb_build_object(
      'folio', p.folio, 'policy_number', p.policy_number,
      'certificate_number', p.certificate_number,
      'contracting_party', p.contracting_party,
      'sum_insured', p.sum_insured, 'deductible', p.deductible,
      'start_date', p.start_date, 'end_date', p.end_date
    ),
    'client', jsonb_build_object(
      'full_name', trim(concat_ws(' ', c.first_name, c.middle_name, c.last_name, c.second_last_name)),
      'curp', c.curp, 'date_of_birth', c.date_of_birth
    ),
    'program', jsonb_build_object('code', pr.code, 'name', pr.name)
  ) INTO v_data
  FROM public.incidents i
  JOIN public.policies p ON p.id = i.policy_id
  JOIN public.clients c ON c.id = i.client_id
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE i.id = _incident_id AND i.client_id = v_client_id;

  IF v_data IS NULL THEN RAISE EXCEPTION 'siniestro_no_encontrado'; END IF;
  RETURN v_data;
END $function$;
