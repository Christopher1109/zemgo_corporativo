ALTER TABLE public.sales_reps
  ADD COLUMN IF NOT EXISTS ref_slug text,
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_reps_ref_slug_key ON public.sales_reps (lower(ref_slug)) WHERE ref_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_reps_code_key ON public.sales_reps (lower(code)) WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sales_rep_slug(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(regexp_replace(lower(public.unaccent(btrim(coalesce(_name,'')))), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION public.upsert_sales_rep_by_name(_name text, _client_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'sheet_sync'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _id uuid;
  _clean text;
  _norm text;
  _slug text;
BEGIN
  _clean := nullif(btrim(_name), '');
  IF _clean IS NULL THEN RETURN NULL; END IF;

  _norm := regexp_replace(lower(public.unaccent(_clean)), '\s+', ' ', 'g');
  _slug := public.sales_rep_slug(_clean);

  SELECT id INTO _id FROM public.sales_reps
  WHERE (ref_slug IS NOT NULL AND lower(ref_slug) = _slug)
     OR (code IS NOT NULL AND lower(code) = lower(_clean))
  LIMIT 1;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.sales_reps
    WHERE regexp_replace(lower(public.unaccent(full_name)), '\s+', ' ', 'g') = _norm
       OR public.sales_rep_slug(full_name) = _slug
    LIMIT 1;
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.sales_reps (full_name, ref_slug, is_active, created_by_sheet_sync)
    VALUES (initcap(_clean), _slug, true, true)
    RETURNING id INTO _id;

    INSERT INTO public.sales_rep_match_review (raw_name, normalized_name, client_id, source, reviewed, resolved_sales_rep_id)
    VALUES (_clean, _norm, _client_id, _source, true, _id);
  END IF;

  RETURN _id;
END $function$;

UPDATE public.sales_reps
SET code = 'v05', ref_slug = 'graciela_rivera',
    program_id = (SELECT id FROM public.programs WHERE code = 'ABC')
WHERE full_name ILIKE 'graciela rivera';

INSERT INTO public.sales_reps (full_name, code, ref_slug, program_id, is_active)
SELECT s.full_name, s.code, s.ref_slug, (SELECT id FROM public.programs WHERE code = 'ABC'), true
FROM (VALUES
  ('Salvador Cavazos','v01','salvador_cavazos'),
  ('Saira Lopez','v02','saira_lopez'),
  ('Alan Gómez','v03','alan_gomez'),
  ('Javier Gómez','v04','javier_gomez'),
  ('Javier Moro','v06','javier_moro'),
  ('Vendedor Prueba 01','v07','vendedor_prueba_01')
) AS s(full_name, code, ref_slug)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_reps r WHERE lower(r.ref_slug) = s.ref_slug OR lower(r.code) = s.code
);