
-- 1. clients: remove NOT EXISTS bypass
DROP POLICY IF EXISTS "Read clients via access" ON public.clients;
CREATE POLICY "Read clients via access" ON public.clients
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.client_programs cp
  WHERE cp.client_id = clients.id
    AND public.has_program_access(auth.uid(), cp.program_id)
));

DROP POLICY IF EXISTS "Insert clients authenticated" ON public.clients;
CREATE POLICY "Insert clients authenticated" ON public.clients
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. contractors: replace open policy
DROP POLICY IF EXISTS contractors_auth_all ON public.contractors;
CREATE POLICY contractors_select ON public.contractors
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY contractors_insert ON public.contractors
FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY contractors_update ON public.contractors
FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR auth.uid() = created_by)
WITH CHECK (public.is_super_admin(auth.uid()) OR auth.uid() = created_by);
CREATE POLICY contractors_delete ON public.contractors
FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- 3. documents: restrict SELECT
DROP POLICY IF EXISTS "Read documents" ON public.documents;
CREATE POLICY "Read documents" ON public.documents
FOR SELECT TO authenticated
USING (auth.uid() = uploaded_by OR public.is_super_admin(auth.uid()));

-- 4. notifications: restrict SELECT and INSERT
DROP POLICY IF EXISTS "Read notifications" ON public.notifications;
CREATE POLICY "Read notifications" ON public.notifications
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. profiles: restrict SELECT
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
CREATE POLICY "Read profiles" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_super_admin(auth.uid()));

-- 6. sales_reps: restrict SELECT to admins
DROP POLICY IF EXISTS sales_reps_select_auth ON public.sales_reps;
CREATE POLICY sales_reps_select_auth ON public.sales_reps
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 7. system_config: restrict SELECT to admins
DROP POLICY IF EXISTS "Read config" ON public.system_config;
CREATE POLICY "Read config" ON public.system_config
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 8. Function search_path fixes
ALTER FUNCTION public.is_valid_curp(text) SET search_path = public;
ALTER FUNCTION public.touch_contractors_updated_at() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- 9. Materialized views: revoke from Data API roles
REVOKE ALL ON public.mv_monthly_new_clients FROM anon, authenticated;
REVOKE ALL ON public.mv_monthly_collection FROM anon, authenticated;

-- 10. SECURITY DEFINER functions: revoke EXECUTE from anon/PUBLIC
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;
