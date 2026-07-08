
ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_policies_sales_rep_id ON public.policies(sales_rep_id);

CREATE TABLE IF NOT EXISTS public.commission_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  min_clients integer NOT NULL DEFAULT 0,
  max_clients integer,
  percentage numeric(5,2) NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_tiers TO authenticated;
GRANT ALL ON public.commission_tiers TO service_role;

ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read commission tiers"
  ON public.commission_tiers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage commission tiers"
  ON public.commission_tiers FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.commission_tiers (program_id, min_clients, max_clients, percentage, label) VALUES
  (NULL, 0, 9, 5.00, 'Inicial'),
  (NULL, 10, 24, 8.00, 'Intermedio'),
  (NULL, 25, 49, 10.00, 'Avanzado'),
  (NULL, 50, NULL, 12.00, 'Élite')
ON CONFLICT DO NOTHING;
