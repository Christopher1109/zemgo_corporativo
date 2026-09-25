ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payer_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payer_phone text;
CREATE INDEX IF NOT EXISTS idx_clients_payer_phone_last10 ON public.clients ((right(regexp_replace(coalesce(payer_phone,''), '\D', '', 'g'), 10)));
CREATE INDEX IF NOT EXISTS idx_clients_phone_last10 ON public.clients ((right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10)));

CREATE TABLE IF NOT EXISTS public.insurer_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurer_report_templates TO authenticated;
GRANT ALL ON public.insurer_report_templates TO service_role;
ALTER TABLE public.insurer_report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "irt read" ON public.insurer_report_templates FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_program_access(auth.uid(), program_id));
CREATE POLICY "irt write" ON public.insurer_report_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager']::app_role[]));
CREATE TRIGGER irt_touch BEFORE UPDATE ON public.insurer_report_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.apply_certificate_assignments(_program_id uuid, _policy_number text, _items jsonb, _file_name text, _overwrite boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; n_ok int := 0; n_skip int := 0; cur text;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT certificate_number INTO cur FROM policies WHERE id = (it->>'policy_id')::uuid AND program_id = _program_id;
    IF NOT FOUND THEN n_skip := n_skip + 1; CONTINUE; END IF;
    IF coalesce(cur,'') <> '' AND cur <> (it->>'certificate_number') AND NOT _overwrite THEN n_skip := n_skip + 1; CONTINUE; END IF;
    UPDATE policies SET certificate_number = it->>'certificate_number',
      policy_number = coalesce(nullif(_policy_number,''), policy_number),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('insurer_alta_date', it->>'alta_date'),
      updated_at = now()
    WHERE id = (it->>'policy_id')::uuid;
    n_ok := n_ok + 1;
  END LOOP;
  IF nullif(_policy_number,'') IS NOT NULL THEN
    UPDATE programs SET policy_number = _policy_number WHERE id = _program_id AND coalesce(policy_number,'') = '';
  END IF;
  INSERT INTO audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (auth.uid(), _program_id, 'policy', 'CERTIFICATES_ASSIGNED',
    jsonb_build_object('file_name', _file_name, 'policy_number', _policy_number, 'applied', n_ok, 'skipped', n_skip, 'overwrite', _overwrite, 'items', _items));
  RETURN jsonb_build_object('applied', n_ok, 'skipped', n_skip);
END $$;
REVOKE ALL ON FUNCTION public.apply_certificate_assignments(uuid,text,jsonb,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_certificate_assignments(uuid,text,jsonb,text,boolean) TO authenticated;