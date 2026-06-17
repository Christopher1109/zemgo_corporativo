
-- =========================================================
-- STORAGE: signatures bucket policies
-- =========================================================
CREATE POLICY "signatures: owner or admin can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "signatures: owner or admin can insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signatures' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "signatures: owner or admin can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'signatures' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "signatures: owner or admin can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'signatures' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_super_admin(auth.uid())
    )
  );

-- =========================================================
-- PROFILES: allow admins to update any profile
-- =========================================================
CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- =========================================================
-- USER_PROGRAM_ACCESS: expand SELECT + lock writes
-- =========================================================
DROP POLICY IF EXISTS "Read own program access" ON public.user_program_access;

CREATE POLICY "Read program access (self, program peers, admins)"
  ON public.user_program_access FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_program_access(auth.uid(), program_id)
    OR public.is_super_admin(auth.uid())
  );

-- No direct writes; all mutations go through SECURITY DEFINER RPCs below.
-- (Absence of INSERT/UPDATE/DELETE policies = denied for authenticated.)

-- =========================================================
-- HELPER: is_last_admin_in_program
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_last_admin_in_program(_user_id uuid, _program_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_program_access
    WHERE user_id = _user_id AND program_id = _program_id AND role = 'admin'
  )
  AND (
    SELECT count(*) FROM public.user_program_access
    WHERE program_id = _program_id AND role = 'admin'
  ) <= 1;
$$;

-- =========================================================
-- RPC: update_user_program_access (admin-only, anti-lockout)
-- _role_text: 'none' revokes; otherwise must be a valid app_role.
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_user_program_access(
  _user_id uuid, _program_id uuid, _role_text text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role app_role;
  v_prev app_role;
  v_program_code text;
  v_target_email text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id IS NULL OR _program_id IS NULL THEN RAISE EXCEPTION 'missing_args'; END IF;

  SELECT code INTO v_program_code FROM public.programs WHERE id = _program_id;
  IF v_program_code IS NULL THEN RAISE EXCEPTION 'program_not_found'; END IF;

  SELECT role INTO v_prev FROM public.user_program_access
   WHERE user_id = _user_id AND program_id = _program_id;

  -- Anti-lockout: cannot remove/downgrade the last admin of a program
  IF v_prev = 'admin' AND _role_text <> 'admin' THEN
    IF public.is_last_admin_in_program(_user_id, _program_id) THEN
      RAISE EXCEPTION 'last_admin_in_program:%', v_program_code;
    END IF;
  END IF;

  -- Anti-lockout: caller cannot remove their own admin in any program
  IF v_caller = _user_id AND v_prev = 'admin' AND _role_text <> 'admin' THEN
    RAISE EXCEPTION 'cannot_remove_own_admin';
  END IF;

  IF _role_text = 'none' OR _role_text IS NULL OR _role_text = '' THEN
    DELETE FROM public.user_program_access
      WHERE user_id = _user_id AND program_id = _program_id;

    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_caller, _program_id, 'user_program_access', _user_id, 'ACCESS_REVOKED',
      jsonb_build_object('target_user', _user_id, 'previous_role', v_prev));
    RETURN jsonb_build_object('ok', true, 'role', null);
  END IF;

  BEGIN
    v_role := _role_text::app_role;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid_role:%', _role_text;
  END;

  INSERT INTO public.user_program_access(user_id, program_id, role)
  VALUES (_user_id, _program_id, v_role)
  ON CONFLICT (user_id, program_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, _program_id, 'user_program_access', _user_id,
    CASE WHEN v_prev IS NULL THEN 'ACCESS_GRANTED' ELSE 'ACCESS_CHANGED' END,
    jsonb_build_object('target_user', _user_id, 'previous_role', v_prev, 'new_role', v_role));

  RETURN jsonb_build_object('ok', true, 'role', v_role);
END $$;

-- Ensure UPSERT works
CREATE UNIQUE INDEX IF NOT EXISTS user_program_access_user_program_uniq
  ON public.user_program_access(user_id, program_id);

-- =========================================================
-- RPC: apply_invite_access_matrix (admin-only)
-- Called after creating an auth user; sets phone on profile and inserts
-- access rows for any (program_id, role) tuples passed in.
-- =========================================================
CREATE OR REPLACE FUNCTION public.apply_invite_access_matrix(
  _user_id uuid, _phone text, _access jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_item jsonb; v_pid uuid; v_role app_role;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;

  UPDATE public.profiles
    SET phone = COALESCE(NULLIF(trim(_phone), ''), phone),
        is_active = true,
        updated_at = now()
    WHERE id = _user_id;

  IF _access IS NOT NULL AND jsonb_typeof(_access) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_access) LOOP
      v_pid := (v_item->>'program_id')::uuid;
      IF (v_item->>'role') IS NOT NULL AND v_item->>'role' <> 'none' THEN
        v_role := (v_item->>'role')::app_role;
        INSERT INTO public.user_program_access(user_id, program_id, role)
        VALUES (_user_id, v_pid, v_role)
        ON CONFLICT (user_id, program_id) DO UPDATE SET role = EXCLUDED.role;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, 'profiles', _user_id, 'USER_INVITED',
    jsonb_build_object('access_matrix', _access, 'phone', _phone));

  RETURN jsonb_build_object('ok', true);
END $$;

-- =========================================================
-- RPC: deactivate_user (admin-only, anti-lockout, no self)
-- =========================================================
CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  r record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_caller = _user_id THEN RAISE EXCEPTION 'cannot_deactivate_self'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  -- Anti-lockout: cannot deactivate the sole admin of any program
  FOR r IN
    SELECT upa.program_id, pr.code
    FROM public.user_program_access upa
    JOIN public.programs pr ON pr.id = upa.program_id
    WHERE upa.user_id = _user_id AND upa.role = 'admin'
  LOOP
    IF public.is_last_admin_in_program(_user_id, r.program_id) THEN
      RAISE EXCEPTION 'last_admin_in_program:%', r.code;
    END IF;
  END LOOP;

  UPDATE public.profiles SET is_active = false, updated_at = now() WHERE id = _user_id;

  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, 'profiles', _user_id, 'USER_DEACTIVATED',
    jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_active = true, updated_at = now() WHERE id = _user_id;
  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, 'profiles', _user_id, 'USER_REACTIVATED', jsonb_build_object());
END $$;

GRANT EXECUTE ON FUNCTION public.is_last_admin_in_program(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_program_access(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invite_access_matrix(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_user(uuid) TO authenticated;
