
-- 1. Add modules column (NULL = todos los módulos)
ALTER TABLE public.user_program_access
  ADD COLUMN IF NOT EXISTS modules TEXT[];

-- 2. Helper: has_module_access
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _program_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_program_access
    WHERE user_id = _user_id
      AND program_id = _program_id
      AND (modules IS NULL OR array_length(modules, 1) IS NULL OR _module = ANY(modules))
  );
$$;

-- 3. Helper: get_user_modules -> {program_id: [modules]}
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(program_id::text, COALESCE(to_jsonb(modules), '[]'::jsonb)),
    '{}'::jsonb
  )
  FROM public.user_program_access
  WHERE user_id = _user_id;
$$;

-- 4. Update update_user_program_access to accept modules
CREATE OR REPLACE FUNCTION public.update_user_program_access(
  _user_id uuid, _program_id uuid, _role_text text, _modules text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role app_role;
  v_prev app_role;
  v_program_code text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $$;
