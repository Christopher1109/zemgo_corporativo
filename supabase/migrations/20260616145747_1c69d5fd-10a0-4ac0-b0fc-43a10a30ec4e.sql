
-- ============= Schema additions =============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS bank_reference_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS payment_schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_payments_policy_id ON public.payments(policy_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_due ON public.payments(status, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_schedule_id ON public.payments(payment_schedule_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_policy_id ON public.payment_schedules(policy_id);

DROP TRIGGER IF EXISTS payments_touch_updated ON public.payments;
CREATE TRIGGER payments_touch_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= create_payment_schedule_for_policy =============
CREATE OR REPLACE FUNCTION public.create_payment_schedule_for_policy(_policy_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_program_code text;
  v_premium numeric(14,2);
  v_start_date date;
  v_amount numeric(14,2);
  v_is_recurring boolean;
  v_frequency payment_frequency;
  v_schedule_id uuid;
BEGIN
  SELECT pr.code, p.premium, p.start_date
    INTO v_program_code, v_premium, v_start_date
  FROM public.policies p
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE p.id = _policy_id;

  IF v_program_code IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
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
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_schedule_for_policy(uuid) TO authenticated, service_role;

-- ============= mark_payment_paid =============
CREATE OR REPLACE FUNCTION public.mark_payment_paid(
  _payment_id uuid,
  _method payment_method,
  _paid_at timestamptz,
  _reference text,
  _paid_amount numeric,
  _notes text,
  _amount_change_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments;
  v_policy public.policies;
  v_schedule public.payment_schedules;
  v_next_due date;
  v_user uuid := auth.uid();
  v_new_payment_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;

  IF NOT public.has_program_role(v_user, v_policy.program_id, ARRAY['admin','manager','operator']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_payment.status = 'paid' THEN
    RAISE EXCEPTION 'already_paid:%', v_payment.paid_at;
  END IF;

  IF _paid_at > now() THEN RAISE EXCEPTION 'paid_at_cannot_be_future'; END IF;

  IF _method IN ('bank_transfer','bank_reference') AND (_reference IS NULL OR length(trim(_reference)) = 0) THEN
    RAISE EXCEPTION 'reference_required';
  END IF;

  UPDATE public.payments SET
    status = 'paid',
    paid_at = _paid_at,
    method = _method,
    paid_amount = COALESCE(_paid_amount, amount),
    bank_reference = COALESCE(_reference, bank_reference),
    notes = _notes,
    provider = COALESCE(provider, 'MANUAL'),
    updated_at = now()
  WHERE id = _payment_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'payments', _payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object(
      'method', _method,
      'paid_at', _paid_at,
      'amount', COALESCE(_paid_amount, v_payment.amount),
      'original_amount', v_payment.amount,
      'amount_change_reason', _amount_change_reason,
      'reference', _reference
    ));

  IF v_payment.payment_schedule_id IS NOT NULL THEN
    SELECT * INTO v_schedule FROM public.payment_schedules WHERE id = v_payment.payment_schedule_id;
    IF v_schedule.is_recurring AND v_schedule.frequency = 'monthly' THEN
      v_next_due := (v_payment.due_date + INTERVAL '1 month')::date;
      IF NOT EXISTS (
        SELECT 1 FROM public.payments
        WHERE policy_id = v_payment.policy_id AND due_date = v_next_due AND payment_schedule_id = v_schedule.id
      ) THEN
        INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
        VALUES (v_payment.policy_id, v_schedule.amount, v_next_due, 'pending', v_schedule.id)
        RETURNING id INTO v_new_payment_id;
      END IF;
      UPDATE public.payment_schedules SET next_due_date = v_next_due WHERE id = v_schedule.id;
    END IF;
  END IF;

  IF v_policy.status = 'suspended' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE policy_id = v_policy.id AND status IN ('overdue','pending') AND due_date < CURRENT_DATE
    ) THEN
      UPDATE public.policies SET status='active', updated_at=now() WHERE id = v_policy.id;
      INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
      VALUES (v_user, v_policy.program_id, 'policy', v_policy.id, 'status:suspended->active',
        jsonb_build_object('from','suspended','to','active','reason','overdue_paid'));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'next_payment_id', v_new_payment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_payment_paid(uuid, payment_method, timestamptz, text, numeric, text, text) TO authenticated;

-- ============= generate_bank_reference =============
CREATE OR REPLACE FUNCTION public.generate_bank_reference(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments;
  v_policy public.policies;
  v_program public.programs;
  v_user uuid := auth.uid();
  v_base text;
  v_checksum int := 0;
  v_ch text;
  v_ref text;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;
  SELECT * INTO v_program FROM public.programs WHERE id = v_policy.program_id;

  IF NOT public.has_program_role(v_user, v_policy.program_id, ARRAY['admin','manager','operator']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_payment.bank_reference IS NOT NULL THEN
    RETURN jsonb_build_object('reference', v_payment.bank_reference, 'expires_at', v_payment.bank_reference_expires_at, 'reused', true);
  END IF;

  v_base := 'HOPE-' || upper(v_program.code) || '-' || v_policy.folio || '-' || to_char(now(), 'YYYYMM');
  FOR i IN 1..length(v_base) LOOP
    v_ch := substr(v_base, i, 1);
    IF v_ch ~ '[0-9]' THEN v_checksum := v_checksum + v_ch::int; END IF;
  END LOOP;
  v_ref := v_base || '-' || lpad((v_checksum % 100)::text, 2, '0');
  v_expires := (date_trunc('month', now()) + INTERVAL '1 month' + INTERVAL '5 days')::timestamptz;

  UPDATE public.payments SET
    bank_reference = v_ref,
    bank_reference_expires_at = v_expires,
    provider = 'BANORTE_STUB',
    updated_at = now()
  WHERE id = _payment_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'payments', _payment_id, 'BANK_REFERENCE_GENERATED',
    jsonb_build_object('reference', v_ref, 'expires_at', v_expires));

  RETURN jsonb_build_object('reference', v_ref, 'expires_at', v_expires, 'reused', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_bank_reference(uuid) TO authenticated;

-- ============= cancel_payment / refund_payment =============
CREATE OR REPLACE FUNCTION public.cancel_payment(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments; v_policy public.policies; v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;
  IF NOT public.has_program_role(v_user, v_policy.program_id, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_payment.status NOT IN ('pending','overdue') THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.payments SET status='cancelled', cancellation_reason=_reason, updated_at=now() WHERE id = _payment_id;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'payments', _payment_id, 'PAYMENT_CANCELLED', jsonb_build_object('reason', _reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_payment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_payment(_payment_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments; v_policy public.policies; v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;
  IF NOT public.has_program_role(v_user, v_policy.program_id, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_payment.status <> 'paid' THEN RAISE EXCEPTION 'only_paid_can_be_refunded'; END IF;
  UPDATE public.payments SET status='refunded', notes = COALESCE(notes,'') || E'\n[REFUND] ' || COALESCE(_reason,''), updated_at=now() WHERE id = _payment_id;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'payments', _payment_id, 'PAYMENT_REFUNDED', jsonb_build_object('reason', _reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.refund_payment(uuid, text) TO authenticated;

-- ============= run_payment_housekeeping =============
CREATE OR REPLACE FUNCTION public.run_payment_housekeeping()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overdue int := 0;
  v_reminders int := 0;
  v_suspended int := 0;
  v_created int := 0;
  r record;
BEGIN
  UPDATE public.payments
    SET status='overdue', updated_at=now()
    WHERE status='pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  FOR r IN
    SELECT p.id AS payment_id, p.policy_id, p.amount, p.due_date,
           pol.client_id, pol.program_id,
           pr.name AS program_name,
           c.first_name, c.last_name, c.email, c.phone
    FROM public.payments p
    JOIN public.payment_schedules s ON s.id = p.payment_schedule_id
    JOIN public.policies pol ON pol.id = p.policy_id
    JOIN public.programs pr ON pr.id = pol.program_id
    JOIN public.clients c ON c.id = pol.client_id
    WHERE p.status = 'pending'
      AND p.due_date = (CURRENT_DATE + (s.reminder_days_before || ' days')::interval)::date
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.template_code = 'PAYMENT_REMINDER'
        AND (n.payload->>'payment_id') = r.payment_id::text
        AND n.created_at > now() - INTERVAL '24 hours'
    ) THEN
      INSERT INTO public.notifications(channel, recipient, template_code, payload, status)
      VALUES (
        'in_app',
        COALESCE(NULLIF(r.email,''), NULLIF(r.phone,''), 'in_app'),
        'PAYMENT_REMINDER',
        jsonb_build_object(
          'payment_id', r.payment_id,
          'policy_id', r.policy_id,
          'client_id', r.client_id,
          'program_id', r.program_id,
          'body', format('Hola %s, tu pago de $%s del programa %s vence el %s.',
                  r.first_name, r.amount::text, r.program_name, to_char(r.due_date, 'YYYY-MM-DD'))
        ),
        'pending'
      );
      v_reminders := v_reminders + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT pol.id, pol.program_id
    FROM public.policies pol
    JOIN public.payments p ON p.policy_id = pol.id
    WHERE pol.status='active'
      AND p.status='overdue'
      AND p.due_date < CURRENT_DATE - INTERVAL '30 days'
  LOOP
    UPDATE public.policies SET status='suspended', updated_at=now() WHERE id = r.id;
    INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
    VALUES (r.program_id, 'policy', r.id, 'POLICY_AUTO_SUSPENDED',
      jsonb_build_object('reason','payment_overdue_30_days'));
    v_suspended := v_suspended + 1;
  END LOOP;

  FOR r IN
    SELECT s.id AS schedule_id, s.policy_id, s.amount, s.next_due_date
    FROM public.payment_schedules s
    WHERE s.is_recurring = true
      AND s.next_due_date IS NOT NULL
      AND s.next_due_date <= CURRENT_DATE + INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.payment_schedule_id = s.id AND p.due_date = s.next_due_date
      )
  LOOP
    INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
    VALUES (r.policy_id, r.amount, r.next_due_date, 'pending', r.schedule_id);
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('overdue', v_overdue, 'reminders', v_reminders, 'suspended', v_suspended, 'created', v_created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_payment_housekeeping() TO authenticated, service_role;

-- ============= Notification template seed =============
INSERT INTO public.notification_templates(code, channel, subject, body)
SELECT 'PAYMENT_REMINDER', 'in_app', 'Tu pago vence pronto',
  'Hola {nombre}, tu pago de ${monto} del programa {programa} vence el {fecha}.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE code = 'PAYMENT_REMINDER');

-- ============= Update payments RLS: cancel/refund/etc go through RPCs (SECURITY DEFINER).
-- Keep existing SELECT/INSERT/UPDATE policies as they were; just ensure DELETE remains admin-only (already).
