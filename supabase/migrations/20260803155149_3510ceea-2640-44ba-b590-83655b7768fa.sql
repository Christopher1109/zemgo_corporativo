-- Inherit sales rep from client when policy is created without one
CREATE OR REPLACE FUNCTION public.policy_inherit_sales_rep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_rep_id IS NULL THEN
    SELECT c.sales_rep_id INTO NEW.sales_rep_id FROM public.clients c WHERE c.id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_inherit_sales_rep ON public.policies;
CREATE TRIGGER trg_policy_inherit_sales_rep
BEFORE INSERT ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.policy_inherit_sales_rep();

-- Safe delete of a sales rep + unlink history
CREATE OR REPLACE FUNCTION public.delete_sales_rep(_sales_rep_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pol int;
  _cli int;
  _name text;
BEGIN
  IF NOT (public.is_any_program_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT full_name INTO _name FROM public.sales_reps WHERE id = _sales_rep_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'Vendedor no encontrado';
  END IF;

  UPDATE public.policies SET sales_rep_id = NULL WHERE sales_rep_id = _sales_rep_id;
  _pol := (SELECT count(*) FROM public.policies WHERE sales_rep_id IS NULL AND false);
  GET DIAGNOSTICS _pol = ROW_COUNT;

  UPDATE public.clients SET sales_rep_id = NULL WHERE sales_rep_id = _sales_rep_id;
  GET DIAGNOSTICS _cli = ROW_COUNT;

  UPDATE public.sales_rep_match_review SET resolved_sales_rep_id = NULL WHERE resolved_sales_rep_id = _sales_rep_id;

  DELETE FROM public.sales_reps WHERE id = _sales_rep_id;

  RETURN jsonb_build_object('ok', true, 'name', _name, 'policies_unlinked', _pol, 'clients_unlinked', _cli);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_sales_rep(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_sales_rep(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.policy_inherit_sales_rep() FROM public, anon, authenticated;