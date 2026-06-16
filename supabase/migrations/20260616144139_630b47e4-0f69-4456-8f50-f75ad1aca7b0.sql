
-- Folio counters
CREATE TABLE IF NOT EXISTS public.policy_folio_counters (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.policy_folio_counters TO authenticated;
GRANT ALL ON public.policy_folio_counters TO service_role;
ALTER TABLE public.policy_folio_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folio counters readable by authenticated"
  ON public.policy_folio_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_policy_folio(_program_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_year int := extract(year from now())::int;
  v_num int;
BEGIN
  SELECT code INTO v_code FROM public.programs WHERE id = _program_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'program not found'; END IF;

  INSERT INTO public.policy_folio_counters(program_id, year, last_number)
  VALUES (_program_id, v_year, 1)
  ON CONFLICT (program_id) DO UPDATE
    SET year = v_year,
        last_number = CASE
          WHEN public.policy_folio_counters.year = v_year
          THEN public.policy_folio_counters.last_number + 1
          ELSE 1
        END,
        updated_at = now()
  RETURNING last_number INTO v_num;

  RETURN upper(v_code) || '-' || v_year::text || '-' || lpad(v_num::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_policy_folio(uuid) TO authenticated;

-- Storage policies for 'certificates' bucket (bucket itself created via tool).
-- Path convention: <program_id>/<policy_id>/<file>.pdf
CREATE POLICY "certificates read by program members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'certificates'
    AND public.has_program_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "certificates write by program members"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'certificates'
    AND public.has_program_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "certificates update by program members"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'certificates'
    AND public.has_program_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
