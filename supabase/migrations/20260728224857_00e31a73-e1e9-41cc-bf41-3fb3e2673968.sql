CREATE OR REPLACE FUNCTION public.get_action_items(_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  WITH access AS (
    SELECT program_id, modules FROM public.user_program_access
    WHERE user_id = auth.uid() AND (_program_id IS NULL OR program_id = _program_id)
  ),
  inc_access AS (
    SELECT program_id FROM access
    WHERE modules IS NULL OR cardinality(modules) = 0 OR 'incidents' = ANY(modules)
  ),
  pay_access AS (
    SELECT program_id FROM access
    WHERE modules IS NULL OR cardinality(modules) = 0
       OR 'payments' = ANY(modules) OR 'finance' = ANY(modules)
  ),
  pol_access AS (
    SELECT program_id FROM access
    WHERE modules IS NULL OR cardinality(modules) = 0
       OR 'policies' = ANY(modules) OR 'alerts' = ANY(modules)
  ),
  pending_inc AS (
    SELECT i.id, i.reported_at, c.first_name||' '||c.last_name AS client_name, pr.code AS program_code
    FROM public.incidents i
    JOIN public.policies p ON p.id = i.policy_id
    JOIN public.clients c ON c.id = i.client_id
    JOIN public.programs pr ON pr.id = p.program_id
    WHERE i.status IN ('reported','pending_review')
      AND i.reported_at < now() - INTERVAL '24 hours'
      AND p.program_id IN (SELECT program_id FROM inc_access)
    ORDER BY i.reported_at ASC LIMIT 20
  ),
  risk_pay AS (
    SELECT pay.id, pay.amount, pay.due_date, pol.folio, pr.code AS program_code,
           c.first_name||' '||c.last_name AS client_name,
           (CURRENT_DATE - pay.due_date) AS days_overdue
    FROM public.payments pay
    JOIN public.policies pol ON pol.id = pay.policy_id
    JOIN public.clients c ON c.id = pol.client_id
    JOIN public.programs pr ON pr.id = pol.program_id
    WHERE pay.status='overdue'
      AND pay.due_date < CURRENT_DATE - INTERVAL '30 days'
      AND pol.program_id IN (SELECT program_id FROM pay_access)
    ORDER BY pay.due_date ASC LIMIT 20
  ),
  upcoming_renew AS (
    SELECT pol.id, pol.folio, pol.end_date, pr.code AS program_code,
           c.first_name||' '||c.last_name AS client_name
    FROM public.policies pol
    JOIN public.clients c ON c.id = pol.client_id
    JOIN public.programs pr ON pr.id = pol.program_id
    WHERE pol.status='active'
      AND pol.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      AND pol.program_id IN (SELECT program_id FROM pol_access)
    ORDER BY pol.end_date ASC LIMIT 20
  ),
  inactive_users AS (
    SELECT pr.id, pr.full_name,
           (SELECT MAX(al.created_at) FROM public.audit_log al WHERE al.user_id = pr.id) AS last_action
    FROM public.profiles pr
    WHERE public.can_manage_users(auth.uid())
      AND pr.is_active = true
      AND EXISTS (SELECT 1 FROM public.user_program_access upa
                  WHERE upa.user_id = pr.id
                    AND upa.program_id IN (SELECT program_id FROM access))
  )
  SELECT jsonb_build_object(
    'pending_incidents', COALESCE((SELECT jsonb_agg(to_jsonb(pi.*)) FROM pending_inc pi), '[]'::jsonb),
    'risk_payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp.*)) FROM risk_pay rp), '[]'::jsonb),
    'upcoming_renewals', COALESCE((SELECT jsonb_agg(to_jsonb(ur.*)) FROM upcoming_renew ur), '[]'::jsonb),
    'inactive_users', COALESCE(
      (SELECT jsonb_agg(to_jsonb(iu.*))
       FROM (SELECT id, full_name, last_action FROM inactive_users
             WHERE last_action IS NULL OR last_action < now() - INTERVAL '90 days'
             LIMIT 20) iu), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_action_items(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_action_items(uuid) FROM anon;