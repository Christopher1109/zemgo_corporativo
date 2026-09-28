ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'yearly';
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_billing_frequency_chk;
ALTER TABLE public.programs ADD CONSTRAINT programs_billing_frequency_chk CHECK (billing_frequency IN ('monthly','yearly'));

-- Costo aseguradora: tabla aparte para que solo superadmin/admin/manager la lean
CREATE TABLE IF NOT EXISTS public.policy_insurer_costs (
  policy_id uuid PRIMARY KEY REFERENCES public.policies(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id),
  insurer_premium numeric(14,2) NOT NULL,
  insurer_premium_detail jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.policy_insurer_costs TO authenticated;
GRANT ALL ON public.policy_insurer_costs TO service_role;
ALTER TABLE public.policy_insurer_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read insurer costs" ON public.policy_insurer_costs FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager']::app_role[]));
CREATE INDEX IF NOT EXISTS policy_insurer_costs_program_idx ON public.policy_insurer_costs(program_id);

CREATE OR REPLACE FUNCTION public.can_view_insurer_cost(_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.update_program_price(_program_id uuid, _price numeric, _frequency text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF _frequency NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'invalid_frequency'; END IF;
  INSERT INTO audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  SELECT auth.uid(), id, 'programs', id, 'PROGRAM_PRICE_UPDATED',
    jsonb_build_object('from', default_premium, 'from_frequency', billing_frequency, 'to', _price, 'to_frequency', _frequency)
  FROM programs WHERE id = _program_id;
  UPDATE programs SET default_premium = _price, billing_frequency = _frequency WHERE id = _program_id;
END $$;

CREATE OR REPLACE FUNCTION public.apply_certificate_assignments(_program_id uuid, _policy_number text, _items jsonb, _file_name text, _overwrite boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE it jsonb; n_ok int := 0; n_skip int := 0; cur text; v_prem numeric;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT certificate_number INTO cur FROM policies WHERE id = (it->>'policy_id')::uuid AND program_id = _program_id;
    IF NOT FOUND THEN n_skip := n_skip + 1; CONTINUE; END IF;
    IF coalesce(cur,'') <> '' AND cur <> (it->>'certificate_number') AND NOT _overwrite THEN n_skip := n_skip + 1; CONTINUE; END IF;
    UPDATE policies SET certificate_number = it->>'certificate_number',
      policy_number = coalesce(nullif(_policy_number,''), policy_number),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('insurer_alta_date', it->>'alta_date'),
      updated_at = now()
    WHERE id = (it->>'policy_id')::uuid;
    v_prem := nullif(it->>'insurer_premium','')::numeric;
    IF v_prem IS NOT NULL AND v_prem > 0 THEN
      INSERT INTO policy_insurer_costs(policy_id, program_id, insurer_premium, insurer_premium_detail, source)
      VALUES ((it->>'policy_id')::uuid, _program_id, v_prem, it->'insurer_premium_detail', 'asignacion_certificados')
      ON CONFLICT (policy_id) DO UPDATE SET insurer_premium = EXCLUDED.insurer_premium,
        insurer_premium_detail = EXCLUDED.insurer_premium_detail, source = EXCLUDED.source, updated_at = now();
    END IF;
    n_ok := n_ok + 1;
  END LOOP;
  IF nullif(_policy_number,'') IS NOT NULL THEN
    UPDATE programs SET policy_number = _policy_number WHERE id = _program_id AND coalesce(policy_number,'') = '';
  END IF;
  INSERT INTO audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (auth.uid(), _program_id, 'policy', 'CERTIFICATES_ASSIGNED',
    jsonb_build_object('file_name', _file_name, 'policy_number', _policy_number, 'applied', n_ok, 'skipped', n_skip, 'overwrite', _overwrite, 'items', _items));
  RETURN jsonb_build_object('applied', n_ok, 'skipped', n_skip);
END $function$;

CREATE OR REPLACE FUNCTION public.manual_activation_preview(_client_id uuid, _program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pol public.policies; v_paid boolean := false; v_prog public.programs;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_prog FROM programs WHERE id=_program_id;
  SELECT * INTO v_pol FROM public.policies WHERE client_id=_client_id AND program_id=_program_id
    AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  IF v_pol.id IS NOT NULL THEN
    v_paid := EXISTS (SELECT 1 FROM public.payments WHERE policy_id=v_pol.id AND status='paid');
  END IF;
  RETURN jsonb_build_object('has_policy', v_pol.id IS NOT NULL, 'has_paid', v_paid,
    'amount', v_prog.default_premium, 'frequency', v_prog.billing_frequency);
END $$;

CREATE OR REPLACE FUNCTION public.manual_activate_client_program(_client_id uuid, _program_id uuid, _amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cp public.client_programs; v_pol public.policies; v_prog public.programs;
  v_folio text; v_amount numeric; v_pay uuid; v_sched uuid;
  v_created_policy boolean := false; v_created_payment boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (public.is_super_admin(v_user) OR public.has_program_role(v_user, _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cp FROM public.client_programs WHERE client_id=_client_id AND program_id=_program_id FOR UPDATE;
  IF v_cp.id IS NULL THEN RAISE EXCEPTION 'enrollment_not_found'; END IF;
  IF v_cp.status = 'active' THEN RAISE EXCEPTION 'already_active'; END IF;
  SELECT * INTO v_prog FROM public.programs WHERE id=_program_id;
  v_amount := COALESCE(v_prog.default_premium, _amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'amount_required'; END IF;

  SELECT * INTO v_pol FROM public.policies WHERE client_id=_client_id AND program_id=_program_id
    AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;

  IF v_pol.id IS NULL THEN
    v_folio := public.next_policy_folio(_program_id);
    INSERT INTO public.policies(client_id, program_id, folio, policy_number, issue_date, start_date, end_date,
      premium, status, created_by, sales_rep_id)
    VALUES (_client_id, _program_id, v_folio, v_prog.policy_number, CURRENT_DATE, CURRENT_DATE,
      (CURRENT_DATE + INTERVAL '1 year')::date, v_amount, 'active', v_user,
      (SELECT sales_rep_id FROM public.clients WHERE id=_client_id))
    RETURNING * INTO v_pol;
    INSERT INTO public.payment_schedules(policy_id, is_recurring, frequency, amount, next_due_date, auto_charge, reminder_days_before)
    VALUES (v_pol.id, true, (CASE WHEN v_prog.billing_frequency='monthly' THEN 'monthly' ELSE 'yearly' END)::payment_frequency,
      v_amount, CURRENT_DATE, false, 10)
    RETURNING id INTO v_sched;
    v_created_policy := true;
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_user, _program_id, 'policy', v_pol.id, 'create', jsonb_build_object('folio', v_folio, 'reason','manual_activation'));
  ELSE
    SELECT id INTO v_sched FROM public.payment_schedules WHERE policy_id=v_pol.id LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE policy_id=v_pol.id AND status='paid') THEN
    SELECT id INTO v_pay FROM public.payments WHERE policy_id=v_pol.id AND status IN ('pending','overdue')
      ORDER BY due_date NULLS LAST LIMIT 1;
    IF v_pay IS NULL THEN
      INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
      VALUES (v_pol.id, v_amount, CURRENT_DATE, 'pending', v_sched) RETURNING id INTO v_pay;
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

REVOKE ALL ON FUNCTION public.update_program_price(uuid,numeric,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.can_view_insurer_cost(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_program_price(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_insurer_cost(uuid) TO authenticated;