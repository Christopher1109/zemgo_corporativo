
-- 1) hospitals table
CREATE TABLE IF NOT EXISTS public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  phone text,
  lat numeric(9,6),
  lng numeric(9,6),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospitals_program ON public.hospitals(program_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT ALL ON public.hospitals TO service_role;

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitals_select_program_access" ON public.hospitals
  FOR SELECT TO authenticated
  USING (public.has_program_access(auth.uid(), program_id));

CREATE POLICY "hospitals_write_admin_manager" ON public.hospitals
  FOR ALL TO authenticated
  USING (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager']::app_role[]));

DROP TRIGGER IF EXISTS touch_hospitals ON public.hospitals;
CREATE TRIGGER touch_hospitals BEFORE UPDATE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) incidents.hospital_id
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL;

-- 3) Portal RPC: list hospitals for policy owner
CREATE OR REPLACE FUNCTION public.get_portal_hospitals(_token text, _policy_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid := public.resolve_portal_session(_token);
  v_program_id uuid;
BEGIN
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'sesion_invalida'; END IF;
  SELECT program_id INTO v_program_id FROM public.policies
    WHERE id = _policy_id AND client_id = v_client_id;
  IF v_program_id IS NULL THEN RAISE EXCEPTION 'poliza_no_encontrada'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', h.id, 'name', h.name, 'address', h.address, 'city', h.city,
      'state', h.state, 'phone', h.phone, 'lat', h.lat, 'lng', h.lng, 'notes', h.notes
    ) ORDER BY h.name)
    FROM public.hospitals h
    WHERE h.program_id = v_program_id AND h.is_active = true
  ), '[]'::jsonb);
END $function$;

-- 4) Update report_portal_incident to accept hospital_id (drop + recreate signature)
DROP FUNCTION IF EXISTS public.report_portal_incident(text, uuid, date, time, text, text, text);
CREATE OR REPLACE FUNCTION public.report_portal_incident(
  _token text,
  _policy_id uuid,
  _accident_date date,
  _accident_time time without time zone,
  _location text,
  _description text,
  _hospital text,
  _hospital_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    location_description, hospital, hospital_id, description, status, reported_at, metadata
  ) VALUES (
    _policy_id, v_client_id, v_occurred, _accident_date, _accident_time,
    _location, v_hospital_name, _hospital_id, _description, 'reported', now(),
    jsonb_build_object('reported_from','portal')
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
  VALUES (v_policy.program_id, 'incident', v_id, 'INCIDENT_REPORTED_PORTAL',
    jsonb_build_object('hospital', v_hospital_name, 'hospital_id', _hospital_id, 'accident_date', _accident_date));

  RETURN v_id;
END $function$;
