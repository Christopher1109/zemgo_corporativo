-- Gate: user managers (superadmin + program admins) instead of superadmin-only
CREATE OR REPLACE FUNCTION public.apply_invite_access_matrix(_user_id uuid, _phone text, _access jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_item jsonb; v_pid uuid; v_role app_role;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.can_manage_users(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_caller uuid := auth.uid();
  r record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.can_manage_users(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.is_super_admin(_user_id) AND NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden_super_admin_target';
  END IF;
  IF v_caller = _user_id THEN RAISE EXCEPTION 'cannot_deactivate_self'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

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
END $function$;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.can_manage_users(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_active = true, updated_at = now() WHERE id = _user_id;
  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, 'profiles', _user_id, 'USER_REACTIVATED', jsonb_build_object());
END $function$;

CREATE OR REPLACE FUNCTION public.update_user_program_access(_user_id uuid, _program_id uuid, _role_text text, _modules text[] DEFAULT NULL::text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role app_role;
  v_prev app_role;
  v_program_code text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.can_manage_users(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.is_super_admin(_user_id) AND NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden_super_admin_target';
  END IF;
  IF _user_id IS NULL OR _program_id IS NULL THEN RAISE EXCEPTION 'missing_args'; END IF;

  SELECT code INTO v_program_code FROM public.programs WHERE id = _program_id;
  IF v_program_code IS NULL THEN RAISE EXCEPTION 'program_not_found'; END IF;

  SELECT role INTO v_prev FROM public.user_program_access
   WHERE user_id = _user_id AND program_id = _program_id;

  IF v_prev = 'admin' AND _role_text <> 'admin' THEN
    IF public.is_last_admin_in_program(_user_id, _program_id) THEN
      RAISE EXCEPTION 'last_admin_in_program:%', v_program_code;
    END IF;
  END IF;

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

  INSERT INTO public.user_program_access(user_id, program_id, role, modules)
  VALUES (_user_id, _program_id, v_role, _modules)
  ON CONFLICT (user_id, program_id) DO UPDATE
    SET role = EXCLUDED.role,
        modules = EXCLUDED.modules;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, _program_id, 'user_program_access', _user_id,
    CASE WHEN v_prev IS NULL THEN 'ACCESS_GRANTED' ELSE 'ACCESS_CHANGED' END,
    jsonb_build_object('target_user', _user_id, 'previous_role', v_prev, 'new_role', v_role, 'modules', _modules));

  RETURN jsonb_build_object('ok', true, 'role', v_role, 'modules', _modules);
END $function$;

CREATE OR REPLACE FUNCTION public.update_user_program_access(_user_id uuid, _program_id uuid, _role_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  RETURN public.update_user_program_access(_user_id, _program_id, _role_text, NULL::text[]);
END $function$;

-- Permanent deletion (app-side removes the auth user afterwards)
CREATE OR REPLACE FUNCTION public.delete_user_account(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_caller uuid := auth.uid();
  r record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.can_manage_users(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_caller = _user_id THEN RAISE EXCEPTION 'cannot_delete_self'; END IF;
  IF public.is_super_admin(_user_id) AND NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden_super_admin_target';
  END IF;

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

  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, diff)
  VALUES (v_caller, 'profiles', _user_id, 'USER_DELETED',
    jsonb_build_object('deleted_user', _user_id));

  DELETE FROM public.user_program_access WHERE user_id = _user_id;
  DELETE FROM public.platform_admins WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;

  RETURN jsonb_build_object('ok', true);
END $function$;

GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO authenticated;

-- No anonymous execution of the new authorization helpers
REVOKE EXECUTE ON FUNCTION public.is_program_admin(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_any_program_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_users(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_module(uuid, uuid, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_module_any_program(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_program_module(uuid, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write_program_module(uuid, app_role[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_user_account(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_program_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_program_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_module(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_any_program(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_program_module(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_program_module(uuid, app_role[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO authenticated;
