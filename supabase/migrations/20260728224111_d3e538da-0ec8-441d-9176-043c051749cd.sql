-- =========================================================
-- 1. Superadmin as its own concept
-- =========================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'admin@hope.local'
ON CONFLICT DO NOTHING;

-- redefine super admin: membership in platform_admins only
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_program_admin(_user_id uuid, _program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
     OR EXISTS (SELECT 1 FROM public.user_program_access
                WHERE user_id = _user_id AND program_id = _program_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_any_program_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_program_access
                 WHERE user_id = _user_id AND role = 'admin');
$$;

-- who may open Configuración / manage users
CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR public.is_any_program_admin(_user_id);
$$;

DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Read platform admins" ON public.platform_admins';
END $$;
CREATE POLICY "Read platform admins" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_users(auth.uid()));

-- =========================================================
-- 2. Module-aware access helpers
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _program_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_program_access
    WHERE user_id = _user_id AND program_id = _program_id
      AND (modules IS NULL OR array_length(modules, 1) IS NULL OR _module = ANY(modules))
  );
$$;

-- true when the user belongs to the program AND has at least one of the modules
CREATE OR REPLACE FUNCTION public.has_any_module(_user_id uuid, _program_id uuid, _modules text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_program_access
    WHERE user_id = _user_id AND program_id = _program_id
      AND (modules IS NULL OR array_length(modules, 1) IS NULL OR modules && _modules)
  );
$$;

-- same, across every program the user belongs to (for global tables)
CREATE OR REPLACE FUNCTION public.has_module_any_program(_user_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_program_access
    WHERE user_id = _user_id
      AND (modules IS NULL OR array_length(modules, 1) IS NULL OR _module = ANY(modules))
  );
$$;

-- program access + module, combined
CREATE OR REPLACE FUNCTION public.can_read_program_module(_program_id uuid, _modules text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
      OR (public.has_program_access(auth.uid(), _program_id)
          AND public.has_any_module(auth.uid(), _program_id, _modules));
$$;

CREATE OR REPLACE FUNCTION public.can_write_program_module(_program_id uuid, _roles app_role[], _modules text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
      OR (public.has_program_role(auth.uid(), _program_id, _roles)
          AND public.has_any_module(auth.uid(), _program_id, _modules));
$$;

GRANT EXECUTE ON FUNCTION public.is_program_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_program_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_module(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_any_program(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_program_module(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_program_module(uuid, app_role[], text[]) TO authenticated;

-- =========================================================
-- 3. programs: only the ones the user belongs to
-- =========================================================
DROP POLICY IF EXISTS "Read programs" ON public.programs;
CREATE POLICY "Read own programs" ON public.programs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_program_access(auth.uid(), id));

-- =========================================================
-- 4. clients / client_programs  (module: clients)
-- =========================================================
DROP POLICY IF EXISTS "Read clients via access" ON public.clients;
CREATE POLICY "Read clients via access" ON public.clients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.client_id = clients.id
      AND public.can_read_program_module(cp.program_id,
            ARRAY['clients','policies','payments','finance','incidents','reports'])
  ));

DROP POLICY IF EXISTS "Update clients via role" ON public.clients;
CREATE POLICY "Update clients via role" ON public.clients
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.client_id = clients.id
      AND public.can_write_program_module(cp.program_id,
            ARRAY['admin','manager','operator']::app_role[], ARRAY['clients'])
  ));

DROP POLICY IF EXISTS "Delete clients admin" ON public.clients;
CREATE POLICY "Delete clients admin" ON public.clients
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.client_id = clients.id AND public.is_program_admin(auth.uid(), cp.program_id)
  ));

DROP POLICY IF EXISTS "Read client_programs" ON public.client_programs;
CREATE POLICY "Read client_programs" ON public.client_programs
  FOR SELECT TO authenticated
  USING (public.can_read_program_module(program_id,
          ARRAY['clients','policies','payments','finance','incidents','reports']));

DROP POLICY IF EXISTS "Insert client_programs" ON public.client_programs;
CREATE POLICY "Insert client_programs" ON public.client_programs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_program_module(program_id,
          ARRAY['admin','manager','operator','sales']::app_role[], ARRAY['clients']));

DROP POLICY IF EXISTS "Update client_programs" ON public.client_programs;
CREATE POLICY "Update client_programs" ON public.client_programs
  FOR UPDATE TO authenticated
  USING (public.can_write_program_module(program_id,
          ARRAY['admin','manager','operator']::app_role[], ARRAY['clients']));

DROP POLICY IF EXISTS "Delete client_programs" ON public.client_programs;
CREATE POLICY "Delete client_programs" ON public.client_programs
  FOR DELETE TO authenticated
  USING (public.is_program_admin(auth.uid(), program_id));

-- =========================================================
-- 5. policies (module: policies)
-- =========================================================
DROP POLICY IF EXISTS "Read policies" ON public.policies;
CREATE POLICY "Read policies" ON public.policies
  FOR SELECT TO authenticated
  USING (public.can_read_program_module(program_id,
          ARRAY['policies','clients','payments','finance','incidents','reports']));

DROP POLICY IF EXISTS "Insert policies" ON public.policies;
CREATE POLICY "Insert policies" ON public.policies
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_program_module(program_id,
          ARRAY['admin','manager','operator','sales']::app_role[], ARRAY['policies']));

DROP POLICY IF EXISTS "Update policies" ON public.policies;
CREATE POLICY "Update policies" ON public.policies
  FOR UPDATE TO authenticated
  USING (public.can_write_program_module(program_id,
          ARRAY['admin','manager','operator']::app_role[], ARRAY['policies']));

DROP POLICY IF EXISTS "Delete policies" ON public.policies;
CREATE POLICY "Delete policies" ON public.policies
  FOR DELETE TO authenticated
  USING (public.is_program_admin(auth.uid(), program_id));

-- =========================================================
-- 6. payments (module: payments / finance)
-- =========================================================
DROP POLICY IF EXISTS "Read payments" ON public.payments;
CREATE POLICY "Read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payments.policy_id
      AND public.can_read_program_module(p.program_id, ARRAY['payments','finance','reports'])
  ));

DROP POLICY IF EXISTS "Insert payments" ON public.payments;
CREATE POLICY "Insert payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payments.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','operator']::app_role[], ARRAY['payments','finance'])
  ));

DROP POLICY IF EXISTS "Update payments" ON public.payments;
CREATE POLICY "Update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payments.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','operator']::app_role[], ARRAY['payments','finance'])
  ));

DROP POLICY IF EXISTS "Delete payments" ON public.payments;
CREATE POLICY "Delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payments.policy_id AND public.is_program_admin(auth.uid(), p.program_id)
  ));

DROP POLICY IF EXISTS "Schedules access" ON public.payment_schedules;
CREATE POLICY "Schedules read" ON public.payment_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payment_schedules.policy_id
      AND public.can_read_program_module(p.program_id, ARRAY['payments','finance','policies','reports'])
  ));
CREATE POLICY "Schedules write" ON public.payment_schedules
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payment_schedules.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','operator']::app_role[], ARRAY['payments','finance','policies'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = payment_schedules.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','operator']::app_role[], ARRAY['payments','finance','policies'])
  ));

-- =========================================================
-- 7. incidents + medical passes (module: incidents) -- STRICT
-- =========================================================
DROP POLICY IF EXISTS "Read incidents" ON public.incidents;
CREATE POLICY "Read incidents" ON public.incidents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = incidents.policy_id
      AND public.can_read_program_module(p.program_id, ARRAY['incidents'])
  ));

DROP POLICY IF EXISTS "Insert incidents" ON public.incidents;
CREATE POLICY "Insert incidents" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = incidents.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','operator','claims']::app_role[], ARRAY['incidents'])
  ));

DROP POLICY IF EXISTS "Update incidents" ON public.incidents;
CREATE POLICY "Update incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = incidents.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','claims']::app_role[], ARRAY['incidents'])
  ));

DROP POLICY IF EXISTS "Delete incidents" ON public.incidents;
CREATE POLICY "Delete incidents" ON public.incidents
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = incidents.policy_id AND public.is_program_admin(auth.uid(), p.program_id)
  ));

DROP POLICY IF EXISTS "Read medical_passes" ON public.medical_passes;
CREATE POLICY "Read medical_passes" ON public.medical_passes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = medical_passes.policy_id
      AND public.can_read_program_module(p.program_id, ARRAY['incidents'])
  ));

DROP POLICY IF EXISTS "Insert medical_passes" ON public.medical_passes;
CREATE POLICY "Insert medical_passes" ON public.medical_passes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = medical_passes.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','claims']::app_role[], ARRAY['incidents'])
  ));

DROP POLICY IF EXISTS "Update medical_passes" ON public.medical_passes;
CREATE POLICY "Update medical_passes" ON public.medical_passes
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.policies p
    WHERE p.id = medical_passes.policy_id
      AND public.can_write_program_module(p.program_id,
            ARRAY['admin','manager','claims']::app_role[], ARRAY['incidents'])
  ));

-- =========================================================
-- 8. hospitals (module: hospitals / incidents)
-- =========================================================
DROP POLICY IF EXISTS "hospitals_select_program_access" ON public.hospitals;
CREATE POLICY "hospitals_select_program_access" ON public.hospitals
  FOR SELECT TO authenticated
  USING (public.can_read_program_module(program_id, ARRAY['hospitals','incidents']));

DROP POLICY IF EXISTS "hospitals_write_admin_manager" ON public.hospitals;
CREATE POLICY "hospitals_write_admin_manager" ON public.hospitals
  FOR ALL TO authenticated
  USING (public.can_write_program_module(program_id,
          ARRAY['admin','manager']::app_role[], ARRAY['hospitals']))
  WITH CHECK (public.can_write_program_module(program_id,
          ARRAY['admin','manager']::app_role[], ARRAY['hospitals']));

-- =========================================================
-- 9. sales_reps + commission tiers (module: sales_reps) -- STRICT
-- =========================================================
DROP POLICY IF EXISTS "sales_reps_select_admin" ON public.sales_reps;
CREATE POLICY "sales_reps_select_module" ON public.sales_reps
  FOR SELECT TO authenticated
  USING (public.has_module_any_program(auth.uid(), 'sales_reps'));

DROP POLICY IF EXISTS "sales_reps_admin_write" ON public.sales_reps;
CREATE POLICY "sales_reps_write" ON public.sales_reps
  FOR ALL TO authenticated
  USING (public.is_any_program_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_any_program_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read commission tiers" ON public.commission_tiers;
CREATE POLICY "Read commission tiers" ON public.commission_tiers
  FOR SELECT TO authenticated
  USING (public.has_module_any_program(auth.uid(), 'sales_reps'));

DROP POLICY IF EXISTS "Super admins manage commission tiers" ON public.commission_tiers;
CREATE POLICY "Manage commission tiers" ON public.commission_tiers
  FOR ALL TO authenticated
  USING (public.is_any_program_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_any_program_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- =========================================================
-- 10. beneficiaries / dependents follow the policies module
-- =========================================================
DROP POLICY IF EXISTS "Beneficiaries access" ON public.beneficiaries;
CREATE POLICY "Beneficiaries read" ON public.beneficiaries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = beneficiaries.policy_id
        AND public.can_read_program_module(p.program_id, ARRAY['policies','clients','incidents','reports'])));
CREATE POLICY "Beneficiaries write" ON public.beneficiaries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = beneficiaries.policy_id
        AND public.can_write_program_module(p.program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['policies'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = beneficiaries.policy_id
        AND public.can_write_program_module(p.program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['policies'])));

DROP POLICY IF EXISTS "Dependents access" ON public.dependents;
CREATE POLICY "Dependents read" ON public.dependents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = dependents.policy_id
        AND public.can_read_program_module(p.program_id, ARRAY['policies','clients','incidents','reports'])));
CREATE POLICY "Dependents write" ON public.dependents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = dependents.policy_id
        AND public.can_write_program_module(p.program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['policies'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = dependents.policy_id
        AND public.can_write_program_module(p.program_id, ARRAY['admin','manager','operator']::app_role[], ARRAY['policies'])));

-- =========================================================
-- 11. Configuración-only tables now reachable by program admins too
-- =========================================================
DROP POLICY IF EXISTS "Admins read config" ON public.system_config;
CREATE POLICY "Admins read config" ON public.system_config
  FOR SELECT TO authenticated USING (public.can_manage_users(auth.uid()));

DROP POLICY IF EXISTS "Admins read notifications" ON public.notifications;
CREATE POLICY "Admins read notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.can_manage_users(auth.uid()));

DROP POLICY IF EXISTS "Read own or admin profiles" ON public.profiles;
CREATE POLICY "Read own or admin profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.can_manage_users(auth.uid()));

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_users(auth.uid()))
  WITH CHECK (public.can_manage_users(auth.uid()));

DROP POLICY IF EXISTS "Read own or admin documents" ON public.documents;
CREATE POLICY "Read own or admin documents" ON public.documents
  FOR SELECT TO authenticated
  USING (auth.uid() = uploaded_by OR public.can_manage_users(auth.uid()));

-- integrations tables stay strictly super-admin
DROP POLICY IF EXISTS "sheet_sync_log_super_admin" ON public.sheet_sync_log;
CREATE POLICY "sheet_sync_log_super_admin" ON public.sheet_sync_log
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "sheet_synced_rows_super_admin" ON public.sheet_synced_rows;
CREATE POLICY "sheet_synced_rows_super_admin" ON public.sheet_synced_rows
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- =========================================================
-- 12. user_program_access: only self, or user managers
-- =========================================================
DROP POLICY IF EXISTS "Read program access (self, program peers, admins)" ON public.user_program_access;
CREATE POLICY "Read program access" ON public.user_program_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.can_manage_users(auth.uid()));

-- =========================================================
-- 13. RPC gates that used to mean "admin anywhere"
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_program_alert_offsets(_program_id uuid, _offsets integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_program_admin(auth.uid(), _program_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _offsets IS NULL OR array_length(_offsets,1) IS NULL THEN RAISE EXCEPTION 'empty_offsets'; END IF;
  UPDATE public.programs SET payment_alert_offsets = _offsets WHERE id = _program_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.update_program_policy_number(_program_id uuid, _policy_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_program_admin(auth.uid(), _program_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.programs SET policy_number = NULLIF(btrim(_policy_number), '') WHERE id = _program_id;
END $$;

-- =========================================================
-- 14. Role promotions (Paso 3b)
-- =========================================================
UPDATE public.user_program_access upa
SET role = 'admin', modules = NULL
FROM auth.users u
WHERE u.id = upa.user_id
  AND lower(u.email) IN (
    'abelardo@zemgo.local','alejandro@zemgo.local','alan.gomez@zemgo.local',
    'ing.javier@zemgo.local','saira@zemgo.local'
  );
