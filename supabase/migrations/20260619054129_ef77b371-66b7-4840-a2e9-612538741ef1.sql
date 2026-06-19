
ALTER TABLE public.clients           ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payments          ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.incidents         ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.beneficiaries     ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.dependents        ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.client_programs   ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.medical_passes    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.renewal_contacts  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_clients_is_demo           ON public.clients           ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
CREATE INDEX IF NOT EXISTS idx_policies_is_demo          ON public.policies          ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
CREATE INDEX IF NOT EXISTS idx_payments_is_demo          ON public.payments          ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
CREATE INDEX IF NOT EXISTS idx_incidents_is_demo         ON public.incidents         ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
CREATE INDEX IF NOT EXISTS idx_sales_reps_is_demo        ON public.sales_reps        ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
CREATE INDEX IF NOT EXISTS idx_profiles_is_demo          ON public.profiles          ((metadata->>'is_demo'))           WHERE metadata->>'is_demo' = 'true';
