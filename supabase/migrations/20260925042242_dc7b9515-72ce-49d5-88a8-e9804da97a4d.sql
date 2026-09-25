CREATE OR REPLACE FUNCTION public.is_my_program(_program_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_sales_rep_id() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.sales_reps
      WHERE id = public.current_sales_rep_id()
        AND (program_id IS NULL OR program_id = _program_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.policies
      WHERE program_id = _program_id AND sales_rep_id = public.current_sales_rep_id()
    )
  ) $$;