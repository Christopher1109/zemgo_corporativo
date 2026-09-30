-- Cobro consolidado a empresas: UN cobro mensual por empresa (lo paga la empresa),
-- en lugar de un cobro por cada certificado de sus asegurados.

CREATE TABLE IF NOT EXISTS public.company_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id),
  period date NOT NULL,                 -- primer día del mes cobrado
  due_date date NOT NULL,
  insured_count int NOT NULL DEFAULT 0,
  unit_price numeric(14,2),
  amount numeric(14,2) NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  paid_amount numeric(14,2),
  method public.payment_method,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period)
);
CREATE INDEX IF NOT EXISTS idx_company_charges_status_due ON public.company_charges(status, due_date);

ALTER TABLE public.company_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_charges_read ON public.company_charges FOR SELECT
  USING (can_read_program_module(program_id, ARRAY['payments','finance','reports','clients']));
CREATE POLICY company_charges_write ON public.company_charges FOR UPDATE
  USING (can_write_program_module(program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['payments','finance']));
CREATE TRIGGER touch_company_charges_updated_at BEFORE UPDATE ON public.company_charges
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Genera (una vez por mes) el cobro de cada empresa activa: asegurados vigentes × precio por persona.
-- Vence el día 10 del mes; se crea con 10 días de anticipación. También marca vencidos.
CREATE OR REPLACE FUNCTION public.generate_company_charges()
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period date := date_trunc('month', current_date + 10)::date;
  v_due date := (date_trunc('month', current_date + 10) + interval '9 days')::date;
  n int := 0;
  r record;
BEGIN
  UPDATE public.company_charges SET status = 'overdue', updated_at = now()
   WHERE status = 'pending' AND due_date < current_date;

  FOR r IN
    SELECT c.id, c.program_id, count(p.id) AS insured,
           (SELECT premium FROM public.policies x WHERE x.company_id = c.id AND x.status = 'active' AND x.premium IS NOT NULL
             GROUP BY premium ORDER BY count(*) DESC LIMIT 1) AS unit_price
      FROM public.companies c
      JOIN public.policies p ON p.company_id = c.id AND p.status = 'active'
     WHERE c.is_active
     GROUP BY c.id, c.program_id
  LOOP
    INSERT INTO public.company_charges(company_id, program_id, period, due_date, insured_count, unit_price, amount)
    VALUES (r.id, r.program_id, v_period, v_due, r.insured, r.unit_price, r.insured * COALESCE(r.unit_price, 0))
    ON CONFLICT (company_id, period) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_company_charge_paid(_charge_id uuid, _method public.payment_method, _paid_at timestamptz,
                                                           _reference text, _paid_amount numeric, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.company_charges; v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v FROM public.company_charges WHERE id = _charge_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'charge_not_found'; END IF;
  IF NOT (public.is_super_admin(v_user) OR public.has_program_role(v_user, v.program_id, ARRAY['admin','manager','operator']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v.status = 'paid' THEN RAISE EXCEPTION 'already_paid'; END IF;
  IF _paid_at > now() THEN RAISE EXCEPTION 'paid_at_cannot_be_future'; END IF;
  UPDATE public.company_charges SET status = 'paid', paid_at = _paid_at, method = _method, reference = NULLIF(_reference,''),
         paid_amount = COALESCE(_paid_amount, amount), notes = _notes, updated_at = now()
   WHERE id = _charge_id;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v.program_id, 'company_charge', _charge_id, 'COMPANY_CHARGE_PAID',
          jsonb_build_object('company_id', v.company_id, 'period', v.period, 'amount', COALESCE(_paid_amount, v.amount),
                             'method', _method, 'reference', _reference));
  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE ALL ON FUNCTION public.mark_company_charge_paid(uuid, public.payment_method, timestamptz, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_company_charge_paid(uuid, public.payment_method, timestamptz, text, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_company_charges() FROM public, anon, authenticated;

-- Certificados de empresa: no generan plan de pagos individual (se cobran consolidados a la empresa).
CREATE OR REPLACE FUNCTION public.create_payment_schedule_for_policy(_policy_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_program_code text;
  v_premium numeric(14,2);
  v_start_date date;
  v_company uuid;
  v_amount numeric(14,2);
  v_is_recurring boolean;
  v_frequency payment_frequency;
  v_schedule_id uuid;
BEGIN
  SELECT pr.code, p.premium, p.start_date, p.company_id
    INTO v_program_code, v_premium, v_start_date, v_company
  FROM public.policies p
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE p.id = _policy_id;

  IF v_program_code IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF v_company IS NOT NULL THEN RETURN NULL; END IF;
  IF v_start_date IS NULL THEN v_start_date := CURRENT_DATE; END IF;

  IF upper(v_program_code) = 'ABC' THEN
    v_amount := COALESCE(v_premium, 160);
    v_is_recurring := true;
    v_frequency := 'monthly';
  ELSIF upper(v_program_code) = 'FUTCARE' THEN
    v_amount := COALESCE(v_premium, 0);
    v_is_recurring := false;
    v_frequency := 'one_time';
  ELSE
    v_amount := COALESCE(v_premium, 0);
    v_is_recurring := true;
    v_frequency := 'monthly';
  END IF;

  SELECT id INTO v_schedule_id FROM public.payment_schedules WHERE policy_id = _policy_id LIMIT 1;
  IF v_schedule_id IS NOT NULL THEN
    RETURN v_schedule_id;
  END IF;

  INSERT INTO public.payment_schedules(policy_id, is_recurring, frequency, amount, next_due_date, auto_charge, reminder_days_before)
  VALUES (_policy_id, v_is_recurring, v_frequency, v_amount, v_start_date, false, 10)
  RETURNING id INTO v_schedule_id;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE policy_id = _policy_id AND due_date = v_start_date) THEN
    INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
    VALUES (_policy_id, v_amount, v_start_date, 'pending', v_schedule_id);
  END IF;

  RETURN v_schedule_id;
END;
$function$;

SELECT cron.schedule('company-charges-daily', '10 6 * * *', $$ select public.generate_company_charges(); $$);
