-- Actualización mensual de asegurados de una empresa (altas / siguen / bajas) en una sola transacción.
-- _payload:
-- {
--   "file_name": "...", "period": "2026-10",
--   "nuevos": [{ first_name, last_name, curp, rfc, date_of_birth, gender, street, colonia, zip,
--                employee_number, alerts: [{field,message}], dependents: [{full_name, relationship, date_of_birth, curp, gender}] }],
--   "siguen": [{ client_id, employee_number, curp, date_of_birth, gender, street, colonia, zip }],
--   "bajas":  [{ client_id, reason }]
-- }
-- Los nuevos se crean con UN certificado sin número (certificate_number NULL) para asignarse después
-- en "Asignación de certificados" con la respuesta de la aseguradora.
CREATE OR REPLACE FUNCTION public.apply_company_monthly_update(_company_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company public.companies;
  v_uid uuid := auth.uid();
  v_policy_number text;
  v_premium numeric;
  v_contracting text;
  v_ramo text;
  it jsonb; dep jsonb;
  v_client uuid; v_policy uuid; v_folio text;
  n_new int := 0; n_reused int := 0; n_upd int := 0; n_baja int := 0; n_skip int := 0;
  v_details jsonb := '[]'::jsonb;
  v_period text := COALESCE(_payload->>'period', to_char(now(), 'YYYY-MM'));
  v_source text := 'actualizacion_mensual_' || COALESCE(_payload->>'period', to_char(now(), 'YYYY-MM'));
BEGIN
  SELECT * INTO v_company FROM public.companies WHERE id = _company_id;
  IF v_company.id IS NULL THEN RAISE EXCEPTION 'company_not_found'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.has_program_role(v_uid, v_company.program_id, ARRAY['admin','manager']::app_role[])) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Condiciones de la empresa: se toman de sus certificados vigentes (lo más común).
  SELECT policy_number INTO v_policy_number FROM public.policies
   WHERE company_id = _company_id AND status <> 'cancelled' AND NULLIF(policy_number,'') IS NOT NULL
   GROUP BY policy_number ORDER BY count(*) DESC LIMIT 1;
  SELECT premium INTO v_premium FROM public.policies
   WHERE company_id = _company_id AND status <> 'cancelled' AND premium IS NOT NULL
   GROUP BY premium ORDER BY count(*) DESC LIMIT 1;
  SELECT contracting_party INTO v_contracting FROM public.policies
   WHERE company_id = _company_id AND status <> 'cancelled' AND contracting_party IS NOT NULL
   GROUP BY contracting_party ORDER BY count(*) DESC LIMIT 1;
  SELECT metadata->>'ramo' INTO v_ramo FROM public.policies
   WHERE company_id = _company_id AND status <> 'cancelled' AND metadata ? 'ramo'
   GROUP BY metadata->>'ramo' ORDER BY count(*) DESC LIMIT 1;

  ------------------------------------------------------------------ NUEVOS
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'nuevos','[]'::jsonb)) LOOP
    v_client := NULL;
    SELECT id INTO v_client FROM public.clients WHERE curp = upper(trim(it->>'curp'));
    IF v_client IS NOT NULL THEN
      UPDATE public.clients SET company_id = _company_id,
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('employee_number', it->'employee_number', 'last_import', v_source)
      WHERE id = v_client;
      n_reused := n_reused + 1;
    ELSE
      INSERT INTO public.clients(first_name, last_name, curp, rfc, date_of_birth, gender, street, colonia, zip, address_full, company_id, created_by, metadata)
      VALUES (trim(it->>'first_name'), trim(it->>'last_name'), upper(trim(it->>'curp')), NULLIF(upper(trim(it->>'rfc')),''),
              NULLIF(it->>'date_of_birth','')::date, NULLIF(it->>'gender',''), NULLIF(it->>'street',''), NULLIF(it->>'colonia',''), NULLIF(it->>'zip',''),
              NULLIF(concat_ws(', ', NULLIF(it->>'street',''), NULLIF(it->>'colonia',''), 'CP ' || NULLIF(it->>'zip','')), ''),
              _company_id, v_uid,
              jsonb_build_object('employee_number', it->'employee_number', 'source', v_source, 'last_import', v_source,
                                 'data_alerts', COALESCE(it->'alerts','[]'::jsonb)))
      RETURNING id INTO v_client;
    END IF;

    IF EXISTS (SELECT 1 FROM public.client_programs WHERE client_id = v_client AND program_id = v_company.program_id) THEN
      UPDATE public.client_programs SET status = 'active', cancelled_at = NULL
       WHERE client_id = v_client AND program_id = v_company.program_id AND status <> 'active';
    ELSE
      INSERT INTO public.client_programs(client_id, program_id, status, enrolled_at, metadata)
      VALUES (v_client, v_company.program_id, 'active', now(), jsonb_build_object('source', v_source, 'company', v_company.legal_name));
    END IF;

    -- Un solo certificado vigente por persona: si ya tiene uno, no se duplica.
    IF EXISTS (SELECT 1 FROM public.policies WHERE client_id = v_client AND program_id = v_company.program_id AND status <> 'cancelled') THEN
      n_skip := n_skip + 1;
      v_details := v_details || jsonb_build_object('curp', it->>'curp', 'accion', 'ya_tenia_certificado');
      CONTINUE;
    END IF;

    v_folio := public.next_policy_folio(v_company.program_id);
    INSERT INTO public.policies(folio, policy_number, certificate_number, program_id, client_id, company_id, status, premium,
                                contracting_party, issue_date, created_by, metadata)
    VALUES (v_folio, v_policy_number, NULL, v_company.program_id, v_client, _company_id, 'active', v_premium,
            COALESCE(v_contracting, v_company.legal_name), current_date, v_uid,
            jsonb_build_object('source', v_source, 'certificate_pending', true, 'period', v_period)
              || CASE WHEN v_ramo IS NOT NULL THEN jsonb_build_object('ramo', v_ramo) ELSE '{}'::jsonb END)
    RETURNING id INTO v_policy;

    FOR dep IN SELECT * FROM jsonb_array_elements(COALESCE(it->'dependents','[]'::jsonb)) LOOP
      INSERT INTO public.dependents(policy_id, full_name, relationship, date_of_birth, metadata)
      VALUES (v_policy, dep->>'full_name', COALESCE(NULLIF(dep->>'relationship',''),'Dependiente'), NULLIF(dep->>'date_of_birth','')::date,
              jsonb_build_object('curp', dep->>'curp', 'gender', dep->>'gender', 'source', v_source));
    END LOOP;

    n_new := n_new + 1;
    v_details := v_details || jsonb_build_object('curp', it->>'curp', 'accion', 'alta', 'folio', v_folio);
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, v_company.program_id, 'policy', v_policy, 'COMPANY_MONTHLY_ALTA',
            jsonb_build_object('company', v_company.legal_name, 'folio', v_folio, 'curp', it->>'curp', 'period', v_period));
  END LOOP;

  ------------------------------------------------------------------ SIGUEN (solo completa datos vacíos)
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'siguen','[]'::jsonb)) LOOP
    UPDATE public.clients c SET
      curp = CASE WHEN c.curp LIKE 'SIN-CURP-%' AND NULLIF(it->>'curp','') IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM public.clients x WHERE x.curp = upper(it->>'curp') AND x.id <> c.id)
                  THEN upper(it->>'curp') ELSE c.curp END,
      date_of_birth = COALESCE(c.date_of_birth, NULLIF(it->>'date_of_birth','')::date),
      gender = COALESCE(c.gender, NULLIF(it->>'gender','')),
      street = COALESCE(c.street, NULLIF(it->>'street','')),
      colonia = COALESCE(c.colonia, NULLIF(it->>'colonia','')),
      zip = COALESCE(c.zip, NULLIF(it->>'zip','')),
      company_id = _company_id,
      metadata = COALESCE(c.metadata,'{}'::jsonb) || jsonb_build_object('last_import', v_source)
                 || CASE WHEN it ? 'employee_number' THEN jsonb_build_object('employee_number', it->'employee_number') ELSE '{}'::jsonb END
    WHERE c.id = (it->>'client_id')::uuid;
    n_upd := n_upd + 1;
  END LOOP;

  ------------------------------------------------------------------ BAJAS
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'bajas','[]'::jsonb)) LOOP
    v_client := (it->>'client_id')::uuid;
    UPDATE public.payments y SET status = 'cancelled', updated_at = now(),
           cancellation_reason = 'Baja de empresa (' || v_period || ')'
      FROM public.policies p
     WHERE p.id = y.policy_id AND p.client_id = v_client AND p.company_id = _company_id
       AND y.status IN ('pending','overdue');
    UPDATE public.payment_schedules s SET is_recurring = false, next_due_date = NULL
      FROM public.policies p WHERE p.id = s.policy_id AND p.client_id = v_client AND p.company_id = _company_id;
    UPDATE public.policies SET status = 'cancelled',
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('cancellation', jsonb_build_object(
             'date', current_date, 'source', v_source, 'reason', COALESCE(it->>'reason', 'Baja reportada por la empresa')))
     WHERE client_id = v_client AND company_id = _company_id AND status <> 'cancelled';
    UPDATE public.client_programs SET status = 'cancelled', cancelled_at = now()
     WHERE client_id = v_client AND program_id = v_company.program_id AND status <> 'cancelled';
    n_baja := n_baja + 1;
    v_details := v_details || jsonb_build_object('client_id', v_client, 'accion', 'baja', 'motivo', it->>'reason');
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, v_company.program_id, 'client', v_client, 'COMPANY_MONTHLY_BAJA',
            jsonb_build_object('company', v_company.legal_name, 'reason', it->>'reason', 'period', v_period));
  END LOOP;

  INSERT INTO public.company_imports(company_id, file_name, rows_detected, rows_created, rows_failed, details, created_by)
  VALUES (_company_id, _payload->>'file_name',
          jsonb_array_length(COALESCE(_payload->'nuevos','[]'::jsonb)) + jsonb_array_length(COALESCE(_payload->'siguen','[]'::jsonb)),
          n_new, 0,
          jsonb_build_object('tipo','actualizacion_mensual','period', v_period, 'altas', n_new, 'reusados', n_reused,
                             'siguen', n_upd, 'bajas', n_baja, 'omitidos', n_skip, 'items', v_details),
          v_uid);

  RETURN jsonb_build_object('altas', n_new, 'siguen', n_upd, 'bajas', n_baja, 'omitidos', n_skip, 'reusados', n_reused);
END $function$;

REVOKE ALL ON FUNCTION public.apply_company_monthly_update(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_company_monthly_update(uuid, jsonb) TO authenticated;
