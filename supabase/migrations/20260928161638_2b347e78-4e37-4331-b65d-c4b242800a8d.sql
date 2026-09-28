ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS default_premium numeric(14,2);

CREATE OR REPLACE FUNCTION public.manual_activation_preview(_client_id uuid, _program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pol public.policies; v_paid boolean := false; v_amount numeric;
BEGIN
  IF NOT public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_pol FROM public.policies WHERE client_id=_client_id AND program_id=_program_id
    AND status NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 1;
  IF v_pol.id IS NOT NULL THEN
    v_paid := EXISTS (SELECT 1 FROM public.payments WHERE policy_id=v_pol.id AND status='paid');
  END IF;
  v_amount := COALESCE(v_pol.premium, (SELECT default_premium FROM public.programs WHERE id=_program_id));
  RETURN jsonb_build_object('has_policy', v_pol.id IS NOT NULL, 'has_paid', v_paid, 'amount', v_amount);
END $$;

CREATE OR REPLACE FUNCTION public.manual_activate_client_program(_client_id uuid, _program_id uuid, _amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cp public.client_programs;
  v_pol public.policies;
  v_prog public.programs;
  v_folio text;
  v_amount numeric;
  v_pay uuid;
  v_created_policy boolean := false;
  v_created_payment boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_program_role(v_user, _program_id, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cp FROM public.client_programs WHERE client_id=_client_id AND program_id=_program_id FOR UPDATE;
  IF v_cp.id IS NULL THEN RAISE EXCEPTION 'enrollment_not_found'; END IF;
  IF v_cp.status = 'active' THEN RAISE EXCEPTION 'already_active'; END IF;
  SELECT * INTO v_prog FROM public.programs WHERE id=_program_id;

  SELECT * INTO v_pol FROM public.policies WHERE client_id=_client_id AND program_id=_program_id
    AND status NOT IN ('cancelled') ORDER BY created_at DESC LIMIT 1;

  IF v_pol.id IS NULL THEN
    v_amount := COALESCE(_amount, v_prog.default_premium);
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'amount_required'; END IF;
    v_folio := public.next_policy_folio(_program_id);
    INSERT INTO public.policies(client_id, program_id, folio, policy_number, issue_date, start_date, end_date,
      premium, status, created_by, sales_rep_id)
    VALUES (_client_id, _program_id, v_folio, v_prog.policy_number, CURRENT_DATE, CURRENT_DATE,
      (CURRENT_DATE + INTERVAL '1 year')::date, v_amount, 'active', v_user,
      (SELECT sales_rep_id FROM public.clients WHERE id=_client_id))
    RETURNING * INTO v_pol;
    PERFORM public.create_payment_schedule_for_policy(v_pol.id);
    v_created_policy := true;
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_user, _program_id, 'policy', v_pol.id, 'create', jsonb_build_object('folio', v_folio, 'reason','manual_activation'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE policy_id=v_pol.id AND status='paid') THEN
    v_amount := COALESCE(_amount, v_pol.premium, v_prog.default_premium);
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'amount_required'; END IF;
    SELECT id INTO v_pay FROM public.payments WHERE policy_id=v_pol.id AND status IN ('pending','overdue')
      ORDER BY due_date NULLS LAST LIMIT 1;
    IF v_pay IS NULL THEN
      INSERT INTO public.payments(policy_id, amount, due_date, status,
        payment_schedule_id)
      VALUES (v_pol.id, v_amount, CURRENT_DATE, 'pending',
        (SELECT id FROM public.payment_schedules WHERE policy_id=v_pol.id LIMIT 1))
      RETURNING id INTO v_pay;
    ELSE
      UPDATE public.payments SET amount=v_amount, updated_at=now() WHERE id=v_pay;
    END IF;
    PERFORM public.mark_payment_paid(v_pay, 'manual', now(), NULL, v_amount,
      'Pago registrado al activar manualmente (venta directa)', NULL);
    IF v_pol.status IN ('draft','pending_payment') THEN
      UPDATE public.policies SET status='active', updated_at=now() WHERE id=v_pol.id;
    END IF;
    v_created_payment := true;
  END IF;

  UPDATE public.client_programs SET status='active', cancelled_at=NULL WHERE id=v_cp.id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, _program_id, 'client_programs', _client_id, 'CLIENT_PROGRAM_MANUAL_ACTIVATION',
    jsonb_build_object('from', v_cp.status, 'to','active', 'policy_id', v_pol.id,
      'created_policy', v_created_policy, 'payment_id', v_pay, 'amount', v_amount, 'channel','venta_directa'));

  RETURN jsonb_build_object('ok', true, 'policy_id', v_pol.id, 'folio', v_pol.folio,
    'created_policy', v_created_policy, 'payment_id', v_pay, 'created_payment', v_created_payment, 'amount', v_amount);
END $$;

REVOKE ALL ON FUNCTION public.manual_activate_client_program(uuid,uuid,numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.manual_activation_preview(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.manual_activate_client_program(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_activation_preview(uuid,uuid) TO authenticated;