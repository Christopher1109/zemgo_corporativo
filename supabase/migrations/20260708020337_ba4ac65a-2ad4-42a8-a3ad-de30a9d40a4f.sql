CREATE OR REPLACE FUNCTION public.update_program_policy_number(_program_id uuid, _policy_number text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  UPDATE public.programs SET policy_number = NULLIF(trim(_policy_number), '') WHERE id = _program_id;
END $function$;