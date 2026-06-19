-- ============= payment_reconciliations =============
CREATE TABLE IF NOT EXISTS public.payment_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  reference text NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('webhook','manual','import')),
  external_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_reconciliations TO authenticated;
GRANT ALL ON public.payment_reconciliations TO service_role;

ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view reconciliations of their program payments"
ON public.payment_reconciliations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payments p
    JOIN public.policies pol ON pol.id = p.policy_id
    WHERE p.id = payment_reconciliations.payment_id
      AND public.has_program_role(auth.uid(), pol.program_id, ARRAY['admin','manager','operator']::app_role[])
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_payment ON public.payment_reconciliations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_reference ON public.payment_reconciliations(reference);

-- ============= bank_reconciliation_log =============
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  amount numeric(12,2),
  status text NOT NULL CHECK (status IN ('matched','not_found','duplicate','amount_mismatch','invalid_signature','invalid_payload','error')),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  error_message text,
  raw_payload jsonb,
  source_ip text
);

GRANT ALL ON public.bank_reconciliation_log TO service_role;

ALTER TABLE public.bank_reconciliation_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (via supabaseAdmin) can read/write.

CREATE INDEX IF NOT EXISTS idx_bank_recon_log_reference ON public.bank_reconciliation_log(reference);
CREATE INDEX IF NOT EXISTS idx_bank_recon_log_received ON public.bank_reconciliation_log(received_at DESC);

-- ============= Auto-generate bank reference on payment insert =============
CREATE OR REPLACE FUNCTION public.auto_generate_bank_reference()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_policy public.policies;
  v_program public.programs;
  v_base text;
  v_checksum int := 0;
  v_ch text;
  v_ref text;
BEGIN
  -- Only auto-generate when pending and no reference yet
  IF NEW.bank_reference IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('pending','overdue') THEN RETURN NEW; END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = NEW.policy_id;
  IF v_policy.id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_program FROM public.programs WHERE id = v_policy.program_id;

  v_base := 'HOPE-' || COALESCE(upper(v_program.code),'GEN') || '-' || v_policy.folio || '-' || to_char(COALESCE(NEW.due_date, CURRENT_DATE), 'YYYYMM');
  FOR i IN 1..length(v_base) LOOP
    v_ch := substr(v_base, i, 1);
    IF v_ch ~ '[0-9]' THEN v_checksum := v_checksum + v_ch::int; END IF;
  END LOOP;
  v_ref := v_base || '-' || lpad((v_checksum % 100)::text, 2, '0');

  NEW.bank_reference := v_ref;
  NEW.bank_reference_expires_at := COALESCE(
    (date_trunc('month', COALESCE(NEW.due_date, CURRENT_DATE)) + INTERVAL '1 month' + INTERVAL '5 days')::timestamptz,
    NEW.bank_reference_expires_at
  );
  NEW.provider := COALESCE(NEW.provider, 'BANORTE_STUB');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_bank_reference ON public.payments;
CREATE TRIGGER trg_auto_bank_reference
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.auto_generate_bank_reference();

-- Backfill existing pending payments without reference
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.payments WHERE bank_reference IS NULL AND status IN ('pending','overdue') LOOP
    UPDATE public.payments SET id = id WHERE id = r.id; -- noop touch to fire... actually trigger is BEFORE INSERT only
  END LOOP;
END $$;

-- Real backfill (the trigger above is INSERT-only, so do an inline backfill):
UPDATE public.payments p
SET bank_reference = sub.ref,
    bank_reference_expires_at = sub.expires,
    provider = COALESCE(p.provider, 'BANORTE_STUB')
FROM (
  SELECT pay.id,
         'HOPE-' || COALESCE(upper(prg.code),'GEN') || '-' || pol.folio || '-' || to_char(COALESCE(pay.due_date, CURRENT_DATE), 'YYYYMM')
           || '-' || lpad(((
             SELECT COALESCE(SUM(c::int),0)
             FROM regexp_split_to_table('HOPE-' || COALESCE(upper(prg.code),'GEN') || '-' || pol.folio || '-' || to_char(COALESCE(pay.due_date, CURRENT_DATE), 'YYYYMM'), '') c
             WHERE c ~ '[0-9]'
           ) % 100)::text, 2, '0') AS ref,
         (date_trunc('month', COALESCE(pay.due_date, CURRENT_DATE)) + INTERVAL '1 month' + INTERVAL '5 days')::timestamptz AS expires
  FROM public.payments pay
  JOIN public.policies pol ON pol.id = pay.policy_id
  JOIN public.programs prg ON prg.id = pol.program_id
  WHERE pay.bank_reference IS NULL AND pay.status IN ('pending','overdue')
) sub
WHERE p.id = sub.id;

-- ============= reconcile_payment_by_reference =============
-- Called by the bank webhook (via supabaseAdmin). Locates the payment, validates
-- amount, marks it paid, and records the reconciliation. Returns a status code.
CREATE OR REPLACE FUNCTION public.reconcile_payment_by_reference(
  _reference text,
  _amount numeric,
  _paid_at timestamptz,
  _external_id text,
  _raw jsonb,
  _source text DEFAULT 'webhook'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments;
  v_policy public.policies;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE bank_reference = _reference FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  -- Already paid? Treat as duplicate (idempotent).
  IF v_payment.status = 'paid' THEN
    RETURN jsonb_build_object('status','duplicate','payment_id',v_payment.id);
  END IF;

  -- Amount must match within 1 peso (handle rounding).
  IF abs(COALESCE(_amount,0) - v_payment.amount) > 1 THEN
    RETURN jsonb_build_object(
      'status','amount_mismatch',
      'payment_id', v_payment.id,
      'expected', v_payment.amount,
      'received', _amount
    );
  END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;

  UPDATE public.payments
  SET status = 'paid',
      paid_at = COALESCE(_paid_at, now()),
      paid_amount = _amount,
      method = 'bank_reference',
      reconciled = true,
      provider_transaction_id = COALESCE(_external_id, provider_transaction_id),
      updated_at = now()
  WHERE id = v_payment.id;

  INSERT INTO public.payment_reconciliations(payment_id, reference, amount, paid_at, source, external_id, raw_payload)
  VALUES (v_payment.id, _reference, _amount, COALESCE(_paid_at, now()), _source, _external_id, _raw);

  -- Reactivate policy if it was suspended
  IF v_policy.status = 'suspended' THEN
    UPDATE public.policies SET status = 'active', updated_at = now() WHERE id = v_policy.id;
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (NULL, v_policy.program_id, 'policy', v_policy.id, 'status:suspended->active',
            jsonb_build_object('from','suspended','to','active','reason','webhook_reconciliation'));
  END IF;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (NULL, v_policy.program_id, 'payments', v_payment.id, 'PAYMENT_RECONCILED',
          jsonb_build_object('reference',_reference,'amount',_amount,'source',_source));

  RETURN jsonb_build_object('status','matched','payment_id',v_payment.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_payment_by_reference(text, numeric, timestamptz, text, jsonb, text) TO service_role;