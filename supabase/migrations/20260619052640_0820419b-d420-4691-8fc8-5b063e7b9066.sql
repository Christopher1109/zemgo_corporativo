
-- ============================================================
-- MVP CLOSE: Policy edit/renewal + Reports tables (sales_reps, renewal_contacts, policy_revisions)
-- ============================================================

-- 1. sales_reps (used by ventas report; seeded in turn 2)
CREATE TABLE IF NOT EXISTS public.sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  referral_source text,                -- e.g. 'QR_ABC_FERIA_MTY', 'WEB_FACEBOOK'
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO authenticated;
GRANT ALL ON public.sales_reps TO service_role;
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_reps_select_auth" ON public.sales_reps FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_reps_admin_write" ON public.sales_reps FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_sales_reps_touch BEFORE UPDATE ON public.sales_reps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. renewal_contacts
CREATE TABLE IF NOT EXISTS public.renewal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  contacted_by uuid NOT NULL REFERENCES auth.users(id),
  contacted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_renewal_contacts_policy ON public.renewal_contacts(policy_id, contacted_at DESC);
GRANT SELECT, INSERT ON public.renewal_contacts TO authenticated;
GRANT ALL ON public.renewal_contacts TO service_role;
ALTER TABLE public.renewal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renewal_contacts_select_by_program" ON public.renewal_contacts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.policies p WHERE p.id = renewal_contacts.policy_id
          AND public.has_program_access(auth.uid(), p.program_id))
);
-- INSERT only via RPC (security definer), but allow direct insert for users with access too.
CREATE POLICY "renewal_contacts_insert_by_program" ON public.renewal_contacts FOR INSERT TO authenticated WITH CHECK (
  contacted_by = auth.uid() AND
  EXISTS (SELECT 1 FROM public.policies p WHERE p.id = renewal_contacts.policy_id
          AND public.has_program_role(auth.uid(), p.program_id,
              ARRAY['admin','manager','operator','claims']::app_role[]))
);

-- 3. policy_revisions
CREATE TABLE IF NOT EXISTS public.policy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  fields_changed jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policy_revisions_policy ON public.policy_revisions(policy_id, edited_at DESC);
GRANT SELECT ON public.policy_revisions TO authenticated;
GRANT ALL ON public.policy_revisions TO service_role;
ALTER TABLE public.policy_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_revisions_select_by_program" ON public.policy_revisions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_revisions.policy_id
          AND public.has_program_access(auth.uid(), p.program_id))
);
-- No INSERT policy → only SECURITY DEFINER RPC can write.

-- 4. Extend policies
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS renewed_from_id uuid REFERENCES public.policies(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_policies_renewed_from ON public.policies(renewed_from_id);

-- 5. RPC update_policy: validates by state, applies, records revision, audit.
CREATE OR REPLACE FUNCTION public.update_policy(_policy_id uuid, _changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_policy public.policies;
  v_allowed text[];
  v_field text;
  v_prev jsonb := '{}'::jsonb;
  v_new  jsonb := '{}'::jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_benef jsonb;
  v_deps jsonb;
  v_paid_total numeric;
  v_sum_pct numeric;
  v_new_premium numeric;
  v_b jsonb; v_d jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = _policy_id FOR UPDATE;
  IF v_policy.id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
       ARRAY['admin','manager','operator']::app_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Allowed fields per state
  v_allowed := CASE v_policy.status::text
    WHEN 'draft' THEN ARRAY['start_date','end_date','premium','sum_insured','deductible','contracting_party','beneficiaries','dependents']
    WHEN 'pending_payment' THEN ARRAY['start_date','end_date','premium','beneficiaries','dependents']
    WHEN 'suspended' THEN ARRAY['start_date','end_date','premium','beneficiaries','dependents']
    WHEN 'active' THEN ARRAY['beneficiaries','dependents']
    ELSE ARRAY[]::text[]
  END;
  IF array_length(v_allowed,1) IS NULL THEN RAISE EXCEPTION 'policy_locked'; END IF;

  -- Beneficiaries validation (must total 100 if provided)
  v_benef := _changes->'beneficiaries';
  IF v_benef IS NOT NULL THEN
    IF jsonb_typeof(v_benef) <> 'array' THEN RAISE EXCEPTION 'beneficiaries_must_be_array'; END IF;
    SELECT COALESCE(SUM((elem->>'percentage')::numeric),0) INTO v_sum_pct
      FROM jsonb_array_elements(v_benef) elem;
    IF jsonb_array_length(v_benef) > 0 AND v_sum_pct <> 100 THEN
      RAISE EXCEPTION 'beneficiaries_must_sum_100';
    END IF;
  END IF;

  -- Premium can't decrease if there are paid payments
  IF _changes ? 'premium' THEN
    v_new_premium := (_changes->>'premium')::numeric;
    SELECT COALESCE(SUM(paid_amount),0) INTO v_paid_total
      FROM public.payments WHERE policy_id = _policy_id AND status='paid';
    IF v_paid_total > 0 AND v_new_premium < COALESCE(v_policy.premium,0) THEN
      RAISE EXCEPTION 'cannot_lower_premium_with_paid';
    END IF;
  END IF;

  -- Apply scalar fields
  FOREACH v_field IN ARRAY v_allowed LOOP
    IF v_field IN ('beneficiaries','dependents') THEN CONTINUE; END IF;
    IF _changes ? v_field THEN
      EXECUTE format('SELECT to_jsonb(%I) FROM public.policies WHERE id=$1', v_field)
        INTO v_prev USING _policy_id;
      v_new := _changes->v_field;
      IF v_prev IS DISTINCT FROM v_new THEN
        v_changed := v_changed || jsonb_build_object(v_field, jsonb_build_object('from', v_prev, 'to', v_new));
        EXECUTE format('UPDATE public.policies SET %I = $1, updated_at=now() WHERE id=$2', v_field)
          USING (_changes->>v_field), _policy_id;
      END IF;
    END IF;
  END LOOP;

  -- Replace beneficiaries
  IF v_benef IS NOT NULL AND 'beneficiaries' = ANY(v_allowed) THEN
    v_changed := v_changed || jsonb_build_object('beneficiaries', v_benef);
    DELETE FROM public.beneficiaries WHERE policy_id = _policy_id;
    FOR v_b IN SELECT * FROM jsonb_array_elements(v_benef) LOOP
      INSERT INTO public.beneficiaries(policy_id, full_name, relationship, percentage, display_order)
      VALUES (_policy_id,
              v_b->>'full_name',
              v_b->>'relationship',
              (v_b->>'percentage')::numeric,
              COALESCE((v_b->>'display_order')::int, 0));
    END LOOP;
  END IF;

  -- Replace dependents
  v_deps := _changes->'dependents';
  IF v_deps IS NOT NULL AND 'dependents' = ANY(v_allowed) THEN
    v_changed := v_changed || jsonb_build_object('dependents', v_deps);
    DELETE FROM public.dependents WHERE policy_id = _policy_id;
    FOR v_d IN SELECT * FROM jsonb_array_elements(v_deps) LOOP
      INSERT INTO public.dependents(policy_id, full_name, relationship, date_of_birth)
      VALUES (_policy_id, v_d->>'full_name', v_d->>'relationship', NULLIF(v_d->>'date_of_birth','')::date);
    END LOOP;
  END IF;

  IF v_changed = '{}'::jsonb THEN RETURN jsonb_build_object('ok', true, 'no_changes', true); END IF;

  INSERT INTO public.policy_revisions(policy_id, edited_by, fields_changed, previous_values, new_values)
  VALUES (_policy_id, v_user, v_changed,
          to_jsonb(v_policy), _changes);

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'policy', _policy_id, 'POLICY_UPDATED',
          jsonb_build_object('fields_changed', v_changed));

  RETURN jsonb_build_object('ok', true, 'fields_changed', v_changed);
END $$;

-- 6. RPC renew_policy
CREATE OR REPLACE FUNCTION public.renew_policy(_source_id uuid, _overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_src public.policies;
  v_new_id uuid;
  v_folio text;
  v_start date;
  v_end date;
  v_premium numeric;
  v_b record; v_d record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_src FROM public.policies WHERE id = _source_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF NOT public.has_program_role(v_user, v_src.program_id,
       ARRAY['admin','manager','operator']::app_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_src.status NOT IN ('active','expired') THEN RAISE EXCEPTION 'cannot_renew_in_state:%', v_src.status; END IF;

  v_folio   := public.next_policy_folio(v_src.program_id);
  v_start   := COALESCE(NULLIF(_overrides->>'start_date','')::date,
                        CASE WHEN v_src.end_date >= CURRENT_DATE THEN v_src.end_date ELSE CURRENT_DATE END);
  v_end     := COALESCE(NULLIF(_overrides->>'end_date','')::date, (v_start + INTERVAL '1 year')::date);
  v_premium := COALESCE(NULLIF(_overrides->>'premium','')::numeric, v_src.premium);

  INSERT INTO public.policies(folio, program_id, client_id, issue_date, start_date, end_date,
    sum_insured, deductible, premium, status, contracting_party, renewed_from_id, metadata, created_by)
  VALUES (v_folio, v_src.program_id, v_src.client_id, CURRENT_DATE, v_start, v_end,
          v_src.sum_insured, v_src.deductible, v_premium, 'pending_payment',
          v_src.contracting_party, v_src.id,
          jsonb_build_object('renewed_from', v_src.id, 'is_renewal', true), v_user)
  RETURNING id INTO v_new_id;

  -- Clone beneficiaries
  FOR v_b IN SELECT full_name, relationship, percentage, display_order FROM public.beneficiaries WHERE policy_id = _source_id LOOP
    INSERT INTO public.beneficiaries(policy_id, full_name, relationship, percentage, display_order)
    VALUES (v_new_id, v_b.full_name, v_b.relationship, v_b.percentage, v_b.display_order);
  END LOOP;
  FOR v_d IN SELECT full_name, relationship, date_of_birth FROM public.dependents WHERE policy_id = _source_id LOOP
    INSERT INTO public.dependents(policy_id, full_name, relationship, date_of_birth)
    VALUES (v_new_id, v_d.full_name, v_d.relationship, v_d.date_of_birth);
  END LOOP;

  -- Create payment schedule for new policy
  PERFORM public.create_payment_schedule_for_policy(v_new_id);

  -- Mark source as expired if still active, set replaced_by
  IF v_src.status = 'active' THEN
    UPDATE public.policies SET status='expired',
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('replaced_by', v_new_id),
           updated_at = now()
    WHERE id = _source_id;
  ELSE
    UPDATE public.policies SET
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('replaced_by', v_new_id),
           updated_at = now()
    WHERE id = _source_id;
  END IF;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_src.program_id, 'policy', v_new_id, 'POLICY_RENEWED',
          jsonb_build_object('source_policy_id', _source_id, 'new_policy_id', v_new_id,
                             'new_folio', v_folio, 'start_date', v_start, 'end_date', v_end));

  RETURN jsonb_build_object('ok', true, 'new_policy_id', v_new_id, 'folio', v_folio);
END $$;

-- 7. RPC log_renewal_contact
CREATE OR REPLACE FUNCTION public.log_renewal_contact(_policy_id uuid, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_policy public.policies;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = _policy_id;
  IF v_policy.id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
       ARRAY['admin','manager','operator','claims']::app_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.renewal_contacts(policy_id, contacted_by, notes)
  VALUES (_policy_id, v_user, NULLIF(_notes,''))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'policy', _policy_id, 'RENEWAL_CONTACT_LOGGED',
          jsonb_build_object('contact_id', v_id, 'notes', _notes));
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_policy(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_policy(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_renewal_contact(uuid, text) TO authenticated;
