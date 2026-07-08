
-- 1) programs.policy_number
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS policy_number text;

-- 2) contractors
CREATE TABLE IF NOT EXISTS public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  curp text,
  rfc text,
  email text,
  phone text,
  phone_alt text,
  street text,
  number text,
  colonia text,
  city text,
  state text,
  zip text,
  address_full text,
  linked_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors TO authenticated;
GRANT ALL ON public.contractors TO service_role;

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractors_auth_all"
  ON public.contractors FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_contractors_phone ON public.contractors (phone);
CREATE INDEX IF NOT EXISTS idx_contractors_email ON public.contractors (lower(email));
CREATE INDEX IF NOT EXISTS idx_contractors_curp ON public.contractors (curp);
CREATE INDEX IF NOT EXISTS idx_contractors_name ON public.contractors USING gin (to_tsvector('simple', full_name));

CREATE OR REPLACE FUNCTION public.touch_contractors_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_contractors_updated_at ON public.contractors;
CREATE TRIGGER trg_contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.touch_contractors_updated_at();

-- 3) policies.contractor_id
ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_policies_contractor_id ON public.policies (contractor_id);

-- 4) Fix get_portal_accident_notice: full_name & add program policy number
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
      'id', i.id,
      'accident_date', i.accident_date,
      'accident_time', i.accident_time,
      'description', i.description,
      'hospital', i.hospital,
      'location', i.location_description,
      'reported_at', i.reported_at
    ),
    'policy', jsonb_build_object(
      'folio', p.folio,
      'policy_number', COALESCE(pr.policy_number, p.policy_number),
      'certificate_number', COALESCE(p.certificate_number, p.folio),
      'contracting_party', COALESCE(
        (SELECT ct.full_name FROM public.contractors ct WHERE ct.id = p.contractor_id),
        p.contracting_party,
        trim(concat_ws(' ', c.first_name, c.last_name))
      ),
      'sum_insured', p.sum_insured,
      'deductible', p.deductible,
      'start_date', p.start_date,
      'end_date', p.end_date
    ),
    'client', jsonb_build_object(
      'full_name', trim(concat_ws(' ', c.first_name, c.last_name)),
      'curp', c.curp,
      'date_of_birth', c.date_of_birth
    ),
    'program', jsonb_build_object(
      'code', pr.code,
      'name', pr.name,
      'policy_number', pr.policy_number
    )
  ) INTO v_data
  FROM public.incidents i
  JOIN public.policies p ON p.id = i.policy_id
  JOIN public.clients c ON c.id = i.client_id
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE i.id = _incident_id AND i.client_id = v_client_id;

  IF v_data IS NULL THEN RAISE EXCEPTION 'siniestro_no_encontrado'; END IF;
  RETURN v_data;
END $function$;

-- 5) RPC to update program policy_number (super_admin only)
CREATE OR REPLACE FUNCTION public.update_program_policy_number(_program_id uuid, _policy_number text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  UPDATE public.programs SET policy_number = NULLIF(trim(_policy_number), '') WHERE id = _program_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.update_program_policy_number(uuid, text) TO authenticated;
