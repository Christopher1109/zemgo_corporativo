-- Relación de HIR en dos archivos (ABC):
--   * AP 50601000157: titulares + cónyuge/hijos. El certificado del titular sigue en policies.certificate_number;
--     el de cada dependiente se guarda en dependents.metadata.certificate_number.
--   * Vida 27001000124: solo titulares, con OTRO número de certificado. Se guarda en
--     policies.metadata.vida_certificate_number (no toca el de AP).

CREATE OR REPLACE FUNCTION public.apply_vida_certificates(_program_id uuid, _items jsonb, _file_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it jsonb; n_ok int := 0; n_skip int := 0;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    UPDATE policies SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'vida_certificate_number', it->>'certificate_number',
        'vida_alta_date', nullif(it->>'alta_date', ''),
        'vida_listed_at', now(),
        'vida_file', _file_name),
      updated_at = now()
    WHERE id = (it->>'policy_id')::uuid AND program_id = _program_id;
    IF FOUND THEN n_ok := n_ok + 1; ELSE n_skip := n_skip + 1; END IF;
  END LOOP;
  INSERT INTO audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (auth.uid(), _program_id, 'policy', 'VIDA_CERTIFICATES_ASSIGNED',
          jsonb_build_object('file_name', _file_name, 'applied', n_ok, 'skipped', n_skip, 'items', _items));
  RETURN jsonb_build_object('applied', n_ok, 'skipped', n_skip);
END $$;

CREATE OR REPLACE FUNCTION public.apply_dependent_certificates(_program_id uuid, _items jsonb, _file_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it jsonb; n_ok int := 0; n_skip int := 0;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    UPDATE dependents d SET
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'certificate_number', it->>'certificate_number',
        'insurer_rfc', nullif(it->>'rfc', ''),
        'insurer_alta_date', nullif(it->>'alta_date', ''),
        'insurer_listed_at', now(),
        'insurer_file', _file_name)
    FROM policies p
    WHERE d.id = (it->>'dependent_id')::uuid AND p.id = d.policy_id AND p.program_id = _program_id;
    IF FOUND THEN n_ok := n_ok + 1; ELSE n_skip := n_skip + 1; END IF;
  END LOOP;
  INSERT INTO audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (auth.uid(), _program_id, 'dependent', 'DEPENDENT_CERTIFICATES_ASSIGNED',
          jsonb_build_object('file_name', _file_name, 'applied', n_ok, 'skipped', n_skip, 'items', _items));
  RETURN jsonb_build_object('applied', n_ok, 'skipped', n_skip);
END $$;

GRANT EXECUTE ON FUNCTION public.apply_vida_certificates(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dependent_certificates(uuid, jsonb, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
