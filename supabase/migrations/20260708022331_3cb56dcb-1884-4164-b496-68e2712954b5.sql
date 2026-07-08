CREATE OR REPLACE FUNCTION public.validate_policy_client_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_programs cp
    WHERE cp.client_id = NEW.client_id
      AND cp.program_id = NEW.program_id
      AND cp.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'client_not_enrolled_in_program';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_policy_client_program ON public.policies;
CREATE TRIGGER validate_policy_client_program
BEFORE INSERT OR UPDATE OF client_id, program_id ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.validate_policy_client_program();