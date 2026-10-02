-- Renovación: el certificado nuevo toma el precio VIGENTE del programa (Configuración),
-- no el que pagó el año anterior. Excepciones: un precio capturado a mano (override) y los
-- certificados de empresa (conservan el precio pactado con la empresa).
CREATE OR REPLACE FUNCTION public.renew_policy(_source_id uuid, _overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_src public.policies;
  v_new_id uuid;
  v_folio text;
  v_start date;
  v_end date;
  v_premium numeric;
  v_b record;
  v_d record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_src FROM public.policies WHERE id = _source_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF NOT public.has_program_role(v_user, v_src.program_id, ARRAY['admin','manager','operator']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_src.status NOT IN ('active','expired') THEN
    RAISE EXCEPTION 'cannot_renew_in_state:%', v_src.status;
  END IF;

  v_folio := public.next_policy_folio(v_src.program_id);
  v_start := COALESCE(NULLIF(_overrides->>'start_date','')::date,
                      CASE WHEN v_src.end_date >= CURRENT_DATE THEN v_src.end_date ELSE CURRENT_DATE END);
  v_end := COALESCE(NULLIF(_overrides->>'end_date','')::date, (v_start + INTERVAL '1 year')::date);
  v_premium := COALESCE(
    NULLIF(_overrides->>'premium','')::numeric,
    CASE WHEN v_src.company_id IS NOT NULL THEN v_src.premium END,
    (SELECT default_premium FROM public.programs WHERE id = v_src.program_id),
    v_src.premium);

  INSERT INTO public.policies(folio, program_id, client_id, issue_date, start_date, end_date,
    sum_insured, deductible, premium, status, contracting_party, renewed_from_id, metadata, created_by)
  VALUES (v_folio, v_src.program_id, v_src.client_id, CURRENT_DATE, v_start, v_end,
    v_src.sum_insured, v_src.deductible, v_premium, 'pending_payment', v_src.contracting_party, v_src.id,
    jsonb_build_object('renewed_from', v_src.id, 'is_renewal', true), v_user)
  RETURNING id INTO v_new_id;

  FOR v_b IN SELECT full_name, relationship, percentage, display_order FROM public.beneficiaries WHERE policy_id = _source_id LOOP
    INSERT INTO public.beneficiaries(policy_id, full_name, relationship, percentage, display_order)
    VALUES (v_new_id, v_b.full_name, v_b.relationship, v_b.percentage, v_b.display_order);
  END LOOP;
  FOR v_d IN SELECT full_name, relationship, date_of_birth FROM public.dependents WHERE policy_id = _source_id LOOP
    INSERT INTO public.dependents(policy_id, full_name, relationship, date_of_birth)
    VALUES (v_new_id, v_d.full_name, v_d.relationship, v_d.date_of_birth);
  END LOOP;

  PERFORM public.create_payment_schedule_for_policy(v_new_id);

  IF v_src.status = 'active' THEN
    UPDATE public.policies SET status='expired',
      metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('replaced_by', v_new_id), updated_at = now()
    WHERE id = _source_id;
  ELSE
    UPDATE public.policies SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('replaced_by', v_new_id), updated_at = now()
    WHERE id = _source_id;
  END IF;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_src.program_id, 'policy', v_new_id, 'POLICY_RENEWED',
    jsonb_build_object('source_policy_id', _source_id, 'new_policy_id', v_new_id, 'new_folio', v_folio,
                       'start_date', v_start, 'end_date', v_end, 'premium', v_premium, 'previous_premium', v_src.premium));

  RETURN jsonb_build_object('ok', true, 'new_policy_id', v_new_id, 'folio', v_folio);
END $function$;
