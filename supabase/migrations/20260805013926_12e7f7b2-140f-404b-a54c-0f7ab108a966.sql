CREATE TABLE public.sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  percentage numeric NOT NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now(),
  period date NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_commissions_rep ON public.sales_commissions(sales_rep_id);
CREATE INDEX idx_sales_commissions_period ON public.sales_commissions(period);
CREATE INDEX idx_sales_commissions_policy ON public.sales_commissions(policy_id);

GRANT SELECT ON public.sales_commissions TO authenticated;
GRANT ALL ON public.sales_commissions TO service_role;

ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_commissions_read" ON public.sales_commissions
FOR SELECT TO authenticated
USING (public.can_read_program_module(program_id, ARRAY['sales_reps']));

CREATE OR REPLACE FUNCTION public.sync_sales_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.policies;
  v_prior integer;
  v_kind text;
  v_pct numeric;
  v_base numeric;
BEGIN
  IF NEW.status <> 'paid' THEN
    DELETE FROM public.sales_commissions WHERE payment_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = NEW.policy_id;
  IF v_policy.id IS NULL OR v_policy.sales_rep_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_prior
  FROM public.payments p
  WHERE p.policy_id = NEW.policy_id
    AND p.status = 'paid'
    AND p.id <> NEW.id
    AND COALESCE(p.paid_at, p.created_at) < COALESCE(NEW.paid_at, NEW.created_at);

  IF v_prior = 0 THEN
    v_kind := 'new';
    v_pct := 20;
  ELSE
    v_kind := 'renewal';
    v_pct := 10;
  END IF;

  v_base := COALESCE(NEW.paid_amount, NEW.amount, 0);

  INSERT INTO public.sales_commissions(
    sales_rep_id, payment_id, policy_id, client_id, program_id,
    kind, percentage, base_amount, amount, earned_at, period
  ) VALUES (
    v_policy.sales_rep_id, NEW.id, v_policy.id, v_policy.client_id, v_policy.program_id,
    v_kind, v_pct, v_base, round(v_base * v_pct / 100.0, 2),
    COALESCE(NEW.paid_at, now()),
    date_trunc('month', COALESCE(NEW.paid_at, now()))::date
  )
  ON CONFLICT (payment_id) DO UPDATE SET
    sales_rep_id = EXCLUDED.sales_rep_id,
    kind = EXCLUDED.kind,
    percentage = EXCLUDED.percentage,
    base_amount = EXCLUDED.base_amount,
    amount = EXCLUDED.amount,
    earned_at = EXCLUDED.earned_at,
    period = EXCLUDED.period;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_sales_commission
AFTER INSERT OR UPDATE OF status, paid_amount, paid_at ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_sales_commission();

INSERT INTO public.sales_commissions(
  sales_rep_id, payment_id, policy_id, client_id, program_id,
  kind, percentage, base_amount, amount, earned_at, period
)
SELECT
  pol.sales_rep_id,
  pay.id,
  pol.id,
  pol.client_id,
  pol.program_id,
  CASE WHEN rn = 1 THEN 'new' ELSE 'renewal' END,
  CASE WHEN rn = 1 THEN 20 ELSE 10 END,
  COALESCE(pay.paid_amount, pay.amount, 0),
  round(COALESCE(pay.paid_amount, pay.amount, 0) * (CASE WHEN rn = 1 THEN 20 ELSE 10 END) / 100.0, 2),
  COALESCE(pay.paid_at, pay.created_at),
  date_trunc('month', COALESCE(pay.paid_at, pay.created_at))::date
FROM (
  SELECT p.*, row_number() OVER (PARTITION BY p.policy_id ORDER BY COALESCE(p.paid_at, p.created_at)) AS rn
  FROM public.payments p
  WHERE p.status = 'paid'
) pay
JOIN public.policies pol ON pol.id = pay.policy_id
WHERE pol.sales_rep_id IS NOT NULL
ON CONFLICT (payment_id) DO NOTHING;