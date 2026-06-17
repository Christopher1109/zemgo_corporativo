
-- ============================================================
-- 1. MATERIALIZED VIEWS for 12-month historical series
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_collection AS
SELECT
  pol.program_id,
  date_trunc('month', p.paid_at)::date AS month,
  COALESCE(SUM(p.paid_amount), 0)::numeric(14,2) AS total,
  COUNT(*)::int AS payment_count
FROM public.payments p
JOIN public.policies pol ON pol.id = p.policy_id
WHERE p.status = 'paid' AND p.paid_at IS NOT NULL
  AND p.paid_at >= date_trunc('month', now()) - INTERVAL '12 months'
GROUP BY pol.program_id, date_trunc('month', p.paid_at);

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_collection_uq
  ON public.mv_monthly_collection(program_id, month);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_new_clients AS
SELECT
  cp.program_id,
  date_trunc('month', cp.created_at)::date AS month,
  COUNT(DISTINCT cp.client_id)::int AS count
FROM public.client_programs cp
WHERE cp.created_at >= date_trunc('month', now()) - INTERVAL '12 months'
GROUP BY cp.program_id, date_trunc('month', cp.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_new_clients_uq
  ON public.mv_monthly_new_clients(program_id, month);

GRANT SELECT ON public.mv_monthly_collection TO authenticated, service_role;
GRANT SELECT ON public.mv_monthly_new_clients TO authenticated, service_role;

-- Refresh function (concurrent so it doesn't block reads)
CREATE OR REPLACE FUNCTION public.refresh_dashboard_mvs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_collection;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_new_clients;
  RETURN jsonb_build_object('ok', true, 'refreshed_at', now());
EXCEPTION WHEN feature_not_supported THEN
  -- First-ever refresh can't be concurrent
  REFRESH MATERIALIZED VIEW public.mv_monthly_collection;
  REFRESH MATERIALIZED VIEW public.mv_monthly_new_clients;
  RETURN jsonb_build_object('ok', true, 'refreshed_at', now(), 'mode','full');
END $$;

-- ============================================================
-- 2. DASHBOARD RPC (single round-trip KPI bundle)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v jsonb := '{}'::jsonb;
  v_curr_start date := date_trunc('month', now())::date;
  v_prev_start date := (date_trunc('month', now()) - INTERVAL '1 month')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  WITH access AS (
    SELECT program_id FROM public.user_program_access
    WHERE user_id = v_uid
      AND (_program_id IS NULL OR program_id = _program_id)
  ),
  kpi AS (
    SELECT
      (SELECT COUNT(DISTINCT cp.client_id)::int FROM public.client_programs cp
         WHERE cp.status = 'active' AND cp.program_id IN (SELECT program_id FROM access)) AS active_clients,
      (SELECT COUNT(*)::int FROM public.policies p
         WHERE p.status = 'active' AND p.program_id IN (SELECT program_id FROM access)) AS active_policies,
      (SELECT COALESCE(SUM(pay.paid_amount),0)::numeric FROM public.payments pay
         JOIN public.policies p ON p.id = pay.policy_id
         WHERE pay.status='paid' AND pay.paid_at >= v_curr_start
           AND p.program_id IN (SELECT program_id FROM access)) AS mtd_collected,
      (SELECT COALESCE(SUM(pay.paid_amount),0)::numeric FROM public.payments pay
         JOIN public.policies p ON p.id = pay.policy_id
         WHERE pay.status='paid' AND pay.paid_at >= v_prev_start AND pay.paid_at < v_curr_start
           AND p.program_id IN (SELECT program_id FROM access)) AS prev_month_collected,
      (SELECT COUNT(*)::int FROM public.incidents i
         JOIN public.policies p ON p.id = i.policy_id
         WHERE i.status IN ('reported','pending_review','in_treatment')
           AND p.program_id IN (SELECT program_id FROM access)) AS open_incidents,
      (SELECT COUNT(*)::int FROM public.incidents i
         JOIN public.policies p ON p.id = i.policy_id
         WHERE i.status = 'pending_review'
           AND i.reported_at < now() - INTERVAL '48 hours'
           AND p.program_id IN (SELECT program_id FROM access)) AS urgent_incidents,
      (SELECT COUNT(*)::int FROM public.policies p
         WHERE p.status='active'
           AND p.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
           AND p.program_id IN (SELECT program_id FROM access)) AS renewals_30d,
      (SELECT COUNT(*)::int FROM public.payments pay
         JOIN public.policies p ON p.id = pay.policy_id
         WHERE pay.status='paid' AND pay.paid_at >= v_curr_start
           AND p.program_id IN (SELECT program_id FROM access)) AS paid_count_mtd,
      (SELECT COUNT(*)::int FROM public.payments pay
         JOIN public.policies p ON p.id = pay.policy_id
         WHERE pay.status='overdue'
           AND p.program_id IN (SELECT program_id FROM access)) AS overdue_count
  )
  SELECT to_jsonb(kpi.*) INTO v FROM kpi;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(uuid) TO authenticated;

-- Top 10 debtors
CREATE OR REPLACE FUNCTION public.get_top_debtors(_program_id uuid, _limit int DEFAULT 10)
RETURNS TABLE(client_id uuid, full_name text, program_code text, total_overdue numeric, oldest_due date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH access AS (
    SELECT program_id FROM public.user_program_access
    WHERE user_id = auth.uid()
      AND (_program_id IS NULL OR program_id = _program_id)
  )
  SELECT c.id,
         (c.first_name || ' ' || c.last_name) AS full_name,
         pr.code,
         SUM(pay.amount)::numeric AS total_overdue,
         MIN(pay.due_date) AS oldest_due
  FROM public.payments pay
  JOIN public.policies p ON p.id = pay.policy_id
  JOIN public.programs pr ON pr.id = p.program_id
  JOIN public.clients c ON c.id = p.client_id
  WHERE pay.status = 'overdue'
    AND p.program_id IN (SELECT program_id FROM access)
  GROUP BY c.id, c.first_name, c.last_name, pr.code
  ORDER BY total_overdue DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_debtors(uuid,int) TO authenticated;

-- Policy distribution
CREATE OR REPLACE FUNCTION public.get_policy_distribution()
RETURNS TABLE(program_id uuid, code text, name text, color text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.code, pr.name, pr.color_primary, COUNT(p.id)
  FROM public.programs pr
  LEFT JOIN public.policies p ON p.program_id = pr.id AND p.status = 'active'
  WHERE pr.id IN (SELECT program_id FROM public.user_program_access WHERE user_id = auth.uid())
  GROUP BY pr.id, pr.code, pr.name, pr.color_primary
  ORDER BY pr.code;
$$;

GRANT EXECUTE ON FUNCTION public.get_policy_distribution() TO authenticated;

-- Action items
CREATE OR REPLACE FUNCTION public.get_action_items(_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  WITH access AS (
    SELECT program_id FROM public.user_program_access
    WHERE user_id = auth.uid() AND (_program_id IS NULL OR program_id = _program_id)
  ),
  pending_inc AS (
    SELECT i.id, i.reported_at, c.first_name||' '||c.last_name AS client_name, pr.code AS program_code
    FROM public.incidents i
    JOIN public.policies p ON p.id = i.policy_id
    JOIN public.clients c ON c.id = i.client_id
    JOIN public.programs pr ON pr.id = p.program_id
    WHERE i.status IN ('reported','pending_review')
      AND i.reported_at < now() - INTERVAL '24 hours'
      AND p.program_id IN (SELECT program_id FROM access)
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
      AND pol.program_id IN (SELECT program_id FROM access)
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
      AND pol.program_id IN (SELECT program_id FROM access)
    ORDER BY pol.end_date ASC LIMIT 20
  ),
  inactive_users AS (
    SELECT pr.id, pr.full_name,
           (SELECT MAX(al.created_at) FROM public.audit_log al WHERE al.user_id = pr.id) AS last_action
    FROM public.profiles pr
    WHERE pr.is_active = true
      AND EXISTS (SELECT 1 FROM public.user_program_access upa
                  WHERE upa.user_id = pr.id
                  AND upa.program_id IN (SELECT program_id FROM access))
    HAVING true
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
END $$;

GRANT EXECUTE ON FUNCTION public.get_action_items(uuid) TO authenticated;

-- Recent activity (audit feed with human labels)
CREATE OR REPLACE FUNCTION public.get_recent_activity(_program_id uuid, _limit int DEFAULT 20)
RETURNS TABLE(id uuid, created_at timestamptz, user_name text, action text, entity_type text, entity_id uuid, program_id uuid, program_code text, diff jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT al.id, al.created_at,
         COALESCE(pr.full_name, 'Sistema') AS user_name,
         al.action, al.entity_type, al.entity_id, al.program_id,
         prg.code AS program_code, al.diff
  FROM public.audit_log al
  LEFT JOIN public.profiles pr ON pr.id = al.user_id
  LEFT JOIN public.programs prg ON prg.id = al.program_id
  WHERE (al.program_id IS NULL OR al.program_id IN (
          SELECT program_id FROM public.user_program_access WHERE user_id = auth.uid()))
    AND (_program_id IS NULL OR al.program_id = _program_id)
  ORDER BY al.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_activity(uuid,int) TO authenticated;

-- ============================================================
-- 3. REPORT TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  default_filters jsonb DEFAULT '{}'::jsonb,
  accessible_to_roles app_role[] DEFAULT ARRAY['admin','manager','operator','viewer']::app_role[],
  admin_only boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read report templates" ON public.report_templates
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.report_templates(code, name, description, sort_order, admin_only) VALUES
  ('cartera',       'Cartera de clientes',    'Todos los clientes con pólizas vigentes',                      10, false),
  ('cobranza',      'Cobranza',               'Pagos del periodo con estado y método',                        20, false),
  ('siniestralidad','Siniestralidad',         'Incidentes y pases médicos por periodo',                       30, false),
  ('renovaciones',  'Renovaciones',           'Pólizas próximas a vencer o vencidas',                         40, false),
  ('ventas',        'Ventas por vendedor',    'Atribución y conversión por sales rep',                        50, false),
  ('actividad',     'Actividad del sistema',  'Bitácora de auditoría estructurada (sólo administradores)',    60, true)
ON CONFLICT (code) DO NOTHING;

-- Saved filter presets per user
CREATE TABLE IF NOT EXISTS public.saved_report_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_code text NOT NULL REFERENCES public.report_templates(code) ON DELETE CASCADE,
  name text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_report_filters TO authenticated;
GRANT ALL ON public.saved_report_filters TO service_role;

ALTER TABLE public.saved_report_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own presets" ON public.saved_report_filters
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_presets_user_report
  ON public.saved_report_filters(user_id, report_code);

CREATE TRIGGER trg_saved_presets_updated
  BEFORE UPDATE ON public.saved_report_filters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. STORAGE POLICIES for `reports` bucket
-- Path layout: {report_code}/{user_id}/{YYYYMMDD-HHMMSS}.{ext}
-- ============================================================
CREATE POLICY "Reports read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports'
         AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "Reports insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports'
              AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "Reports admin all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'reports' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'reports' AND public.is_super_admin(auth.uid()));

-- ============================================================
-- 5. Useful indexes (only if missing)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_policies_program_status_end
  ON public.policies(program_id, status, end_date);
CREATE INDEX IF NOT EXISTS idx_client_programs_program_status
  ON public.client_programs(program_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_program_created
  ON public.audit_log(program_id, created_at DESC);

-- ============================================================
-- 6. Initial MV population
-- ============================================================
REFRESH MATERIALIZED VIEW public.mv_monthly_collection;
REFRESH MATERIALIZED VIEW public.mv_monthly_new_clients;
