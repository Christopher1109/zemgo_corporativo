CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  rfc text,
  contact_name text,
  email text,
  phone text,
  address_full text,
  city text,
  state text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_program ON public.companies(program_id);

ALTER TABLE public.clients ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.policies ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_policies_company ON public.policies(company_id);

CREATE TABLE public.company_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text,
  rows_detected integer NOT NULL DEFAULT 0,
  rows_created integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_imports_company ON public.company_imports(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
GRANT SELECT, INSERT ON public.company_imports TO authenticated;
GRANT ALL ON public.company_imports TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_read" ON public.companies
FOR SELECT TO authenticated
USING (public.can_read_program_module(program_id, ARRAY['clients']));

CREATE POLICY "companies_write" ON public.companies
FOR ALL TO authenticated
USING (public.can_write_program_module(program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['clients']))
WITH CHECK (public.can_write_program_module(program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['clients']));

CREATE POLICY "company_imports_read" ON public.company_imports
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id = company_imports.company_id
    AND public.can_read_program_module(c.program_id, ARRAY['clients'])
));

CREATE POLICY "company_imports_insert" ON public.company_imports
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.companies c
  WHERE c.id = company_imports.company_id
    AND public.can_write_program_module(c.program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['clients'])
));

CREATE TRIGGER touch_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();