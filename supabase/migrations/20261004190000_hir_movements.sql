-- Flujo mensual con HIR Seguros:
--  1) Altas / bajas se descargan en el formato de HIR desde "Asignación de certificados" y se marcan como enviadas.
--  2) El PDF "Relación de asegurados" de HIR asigna certificados y completa el RFC con homoclave.
--  3) La actualización mensual guarda apellido paterno y materno por separado (los pide HIR).

-- 1) Marcar altas / bajas como enviadas a la aseguradora.
CREATE OR REPLACE FUNCTION public.mark_insurer_movements_sent(_program_id uuid, _policy_ids uuid[], _kind text,
                                                              _movement_date date, _file_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_key text; n int;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_program_role(v_uid, _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _kind NOT IN ('alta','baja') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  v_key := CASE WHEN _kind = 'alta' THEN 'insurer_alta_sent' ELSE 'insurer_baja_sent' END;
  UPDATE public.policies
     SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(v_key,
           jsonb_build_object('at', now(), 'movement_date', _movement_date, 'file_name', _file_name, 'by', v_uid)),
         updated_at = now()
   WHERE id = ANY(_policy_ids) AND program_id = _program_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (v_uid, _program_id, 'policy', CASE WHEN _kind = 'alta' THEN 'INSURER_ALTAS_SENT' ELSE 'INSURER_BAJAS_SENT' END,
          jsonb_build_object('count', n, 'file_name', _file_name, 'movement_date', _movement_date, 'policy_ids', to_jsonb(_policy_ids)));
  RETURN jsonb_build_object('marked', n);
END $function$;
REVOKE ALL ON FUNCTION public.mark_insurer_movements_sent(uuid, uuid[], text, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_insurer_movements_sent(uuid, uuid[], text, date, text) TO authenticated;

-- 2) Asignación de certificados: además guarda el RFC con homoclave de la aseguradora
--    (solo si el cliente no tiene RFC o tiene únicamente los 10 primeros caracteres iguales).
CREATE OR REPLACE FUNCTION public.apply_certificate_assignments(_program_id uuid, _policy_number text, _items jsonb, _file_name text, _overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it jsonb; n_ok int := 0; n_skip int := 0; n_rfc int := 0; cur text; v_prem numeric; v_rfc text; v_client uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_program_role(auth.uid(), _program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT certificate_number, client_id INTO cur, v_client FROM policies WHERE id = (it->>'policy_id')::uuid AND program_id = _program_id;
    IF NOT FOUND THEN n_skip := n_skip + 1; CONTINUE; END IF;
    IF coalesce(cur,'') <> '' AND cur <> (it->>'certificate_number') AND NOT _overwrite THEN n_skip := n_skip + 1; CONTINUE; END IF;
    UPDATE policies SET certificate_number = it->>'certificate_number',
      policy_number = coalesce(nullif(_policy_number,''), policy_number),
      metadata = (coalesce(metadata,'{}'::jsonb) - 'certificate_pending')
                 || jsonb_build_object('insurer_alta_date', it->>'alta_date', 'insurer_listed_at', now(), 'insurer_file', _file_name),
      updated_at = now()
    WHERE id = (it->>'policy_id')::uuid;
    v_prem := nullif(it->>'insurer_premium','')::numeric;
    IF v_prem IS NOT NULL AND v_prem > 0 THEN
      INSERT INTO policy_insurer_costs(policy_id, program_id, insurer_premium, insurer_premium_detail, source)
      VALUES ((it->>'policy_id')::uuid, _program_id, v_prem, it->'insurer_premium_detail', 'asignacion_certificados')
      ON CONFLICT (policy_id) DO UPDATE SET insurer_premium = EXCLUDED.insurer_premium,
        insurer_premium_detail = EXCLUDED.insurer_premium_detail, source = EXCLUDED.source, updated_at = now();
    END IF;
    v_rfc := upper(nullif(trim(it->>'rfc'),''));
    IF v_rfc ~ '^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$' THEN
      UPDATE clients SET rfc = v_rfc, updated_at = now()
       WHERE id = v_client
         AND (nullif(rfc,'') IS NULL OR (length(rfc) < 13 AND left(rfc,10) = left(v_rfc,10)))
         AND (curp IS NULL OR curp LIKE 'SIN-CURP-%' OR left(curp,10) = left(v_rfc,10) OR nullif(rfc,'') IS NULL);
      IF FOUND THEN n_rfc := n_rfc + 1; END IF;
    END IF;
    n_ok := n_ok + 1;
  END LOOP;
  IF nullif(_policy_number,'') IS NOT NULL THEN
    UPDATE programs SET policy_number = _policy_number WHERE id = _program_id AND coalesce(policy_number,'') = '';
  END IF;
  INSERT INTO audit_log(user_id, program_id, entity_type, action, diff)
  VALUES (auth.uid(), _program_id, 'policy', 'CERTIFICATES_ASSIGNED',
    jsonb_build_object('file_name', _file_name, 'policy_number', _policy_number, 'applied', n_ok, 'skipped', n_skip,
                       'rfc_updated', n_rfc, 'overwrite', _overwrite, 'items', _items));
  RETURN jsonb_build_object('applied', n_ok, 'skipped', n_skip, 'rfc_updated', n_rfc);
END $function$;

-- 3) Actualización mensual: guardar apellido paterno / materno por separado en clients.metadata.
--    Se parchea la versión vigente de la función (sin reescribirla) para no perder cambios previos.
DO $patch$
DECLARE d text; d2 text; v_names text := $x$ || jsonb_strip_nulls(jsonb_build_object('apellido_paterno', NULLIF(it->>'paterno',''), 'apellido_materno', NULLIF(it->>'materno','')))$x$;
BEGIN
  d := pg_get_functiondef('public.apply_company_monthly_update(uuid,jsonb)'::regprocedure);
  IF position('apellido_paterno' IN d) > 0 THEN RETURN; END IF;
  d2 := d;
  -- Nuevo cliente
  d2 := replace(d2, $x$'data_alerts', COALESCE(it->'alerts','[]'::jsonb)))$x$,
                    $x$'data_alerts', COALESCE(it->'alerts','[]'::jsonb))$x$ || v_names || ')');
  -- Cliente existente reutilizado
  d2 := replace(d2, $x$jsonb_build_object('employee_number', it->'employee_number', 'last_import', v_source)$x$,
                    $x$jsonb_build_object('employee_number', it->'employee_number', 'last_import', v_source)$x$ || v_names);
  -- Siguen
  d2 := replace(d2, $x$jsonb_build_object('last_import', v_source)
                 ||$x$, $x$jsonb_build_object('last_import', v_source)$x$ || v_names || $x$
                 ||$x$);
  IF (length(d2) - length(d)) < 3 * length(v_names) - 10 THEN
    RAISE EXCEPTION 'apply_company_monthly_update: no se pudo aplicar el parche de apellidos';
  END IF;
  EXECUTE d2;
END $patch$;
