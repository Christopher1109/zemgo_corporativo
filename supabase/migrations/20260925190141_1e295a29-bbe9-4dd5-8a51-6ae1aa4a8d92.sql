CREATE OR REPLACE FUNCTION public.process_sheet_row(_sheet_id text, _program text, _row_number integer, _row_hash text, _row_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing_hash text;
  _existing_status text;
  _folio text;
  _curp text;
  _curp_pending boolean := false;
  _first_name text;
  _last_name text;
  _email text;
  _phone text;
  _phone_digits text;
  _dob date;
  _gender text;
  _address text;
  _vendor text;
  _start_date date;
  _end_date date;
  _issue_date date;
  _sum_insured numeric;
  _premium numeric;
  _program_id uuid;
  _client_id uuid;
  _policy_id uuid;
  _sales_rep_id uuid;
  _is_new_policy boolean := false;
  _is_new_client boolean := false;
  _action text;
  _ben text;
  _ben_idx int := 0;
BEGIN
  _folio := nullif(btrim(coalesce(_row_data->>'folio','')), '');
  IF _folio IS NULL THEN
    INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, status, raw_data)
    VALUES (_sheet_id, _program, _row_number, _row_hash, 'skipped_no_folio', _row_data)
    ON CONFLICT (sheet_id, row_number) DO UPDATE
      SET row_hash = EXCLUDED.row_hash, status = 'skipped_no_folio', raw_data = EXCLUDED.raw_data,
          last_synced_at = now(), error_message = NULL;
    RETURN jsonb_build_object('action','skipped_no_folio');
  END IF;

  SELECT row_hash, status INTO _existing_hash, _existing_status
    FROM public.sheet_synced_rows
    WHERE sheet_id = _sheet_id AND row_number = _row_number;
  IF _existing_hash = _row_hash AND _existing_status IN ('synced','synced_new','synced_updated') THEN
    UPDATE public.sheet_synced_rows SET last_synced_at = now()
      WHERE sheet_id = _sheet_id AND row_number = _row_number;
    RETURN jsonb_build_object('action','unchanged');
  END IF;

  SELECT id INTO _program_id FROM public.programs WHERE upper(code) = upper(_program);
  IF _program_id IS NULL THEN
    INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, folio, status, error_message, raw_data)
    VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, 'failed', 'programa desconocido: '||_program, _row_data)
    ON CONFLICT (sheet_id, row_number) DO UPDATE
      SET row_hash = EXCLUDED.row_hash, status='failed', error_message = EXCLUDED.error_message,
          raw_data = EXCLUDED.raw_data, last_synced_at = now(), folio = EXCLUDED.folio;
    RETURN jsonb_build_object('action','failed','reason','unknown_program');
  END IF;

  _first_name := nullif(btrim(coalesce(_row_data->>'first_name','')), '');
  _last_name  := nullif(btrim(coalesce(_row_data->>'last_name','')), '');
  IF _first_name IS NULL THEN _first_name := '(sin nombre)'; END IF;
  IF _last_name  IS NULL THEN _last_name  := '(sin apellido)'; END IF;
  _email   := lower(nullif(btrim(coalesce(_row_data->>'email','')), ''));
  _phone   := nullif(btrim(coalesce(_row_data->>'phone','')), '');
  _phone_digits := right(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), 10);
  _gender  := nullif(btrim(coalesce(_row_data->>'gender','')), '');
  _address := nullif(btrim(coalesce(_row_data->>'address','')), '');
  _vendor  := nullif(btrim(coalesce(_row_data->>'vendor','')), '');
  BEGIN _dob := (_row_data->>'date_of_birth')::date; EXCEPTION WHEN OTHERS THEN _dob := NULL; END;
  BEGIN _start_date := (_row_data->>'start_date')::date; EXCEPTION WHEN OTHERS THEN _start_date := NULL; END;
  BEGIN _end_date := (_row_data->>'end_date')::date; EXCEPTION WHEN OTHERS THEN _end_date := NULL; END;
  BEGIN _issue_date := (_row_data->>'issue_date')::date; EXCEPTION WHEN OTHERS THEN _issue_date := _start_date; END;
  BEGIN _sum_insured := (_row_data->>'sum_insured')::numeric; EXCEPTION WHEN OTHERS THEN _sum_insured := NULL; END;
  BEGIN _premium := (_row_data->>'premium')::numeric; EXCEPTION WHEN OTHERS THEN _premium := NULL; END;

  -- CURP opcional: si falta o es inválida, se genera una provisional y se marca como pendiente.
  _curp := upper(nullif(btrim(coalesce(_row_data->>'curp','')), ''));
  IF _curp IS NULL OR NOT public.is_valid_curp(_curp) THEN
    _curp_pending := true;
    _curp := 'PEND' || upper(substr(md5(coalesce(_first_name,'')||'|'||coalesce(_last_name,'')||'|'||coalesce(_phone_digits,'')||'|'||_folio), 1, 14));
  END IF;

  -- Buscar cliente existente: por CURP; si la CURP es provisional, por teléfono + nombre.
  SELECT id INTO _client_id FROM public.clients WHERE curp = _curp;
  IF _client_id IS NULL AND _curp_pending AND _phone_digits <> '' THEN
    SELECT c.id INTO _client_id
      FROM public.clients c
     WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = _phone_digits
       AND public.normalize_person_name(c.first_name||' '||c.last_name) = public.normalize_person_name(_first_name||' '||_last_name)
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  IF _client_id IS NULL THEN
    INSERT INTO public.clients (first_name, last_name, curp, email, phone, date_of_birth, gender, address_full, metadata)
    VALUES (_first_name, _last_name, _curp, _email, _phone, _dob, _gender, _address,
            jsonb_build_object('source','sheet_sync','sheet_id',_sheet_id,'curp_pending',_curp_pending))
    RETURNING id INTO _client_id;
    _is_new_client := true;
  ELSE
    UPDATE public.clients SET
      first_name = COALESCE(NULLIF(_first_name,'(sin nombre)'), first_name),
      last_name  = COALESCE(NULLIF(_last_name,'(sin apellido)'), last_name),
      email      = COALESCE(_email, email),
      phone      = COALESCE(_phone, phone),
      date_of_birth = COALESCE(_dob, date_of_birth),
      gender     = COALESCE(_gender, gender),
      address_full = COALESCE(_address, address_full),
      metadata   = CASE WHEN _curp_pending THEN COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('curp_pending', true) ELSE metadata END
    WHERE id = _client_id;
  END IF;

  -- Resolver vendedor DESPUÉS de tener client_id, para poder loguear intentos sin match.
  _sales_rep_id := public.upsert_sales_rep_by_name(_vendor, _client_id, 'sheet_sync');
  IF _sales_rep_id IS NOT NULL THEN
    UPDATE public.clients SET sales_rep_id = _sales_rep_id WHERE id = _client_id AND sales_rep_id IS NULL;
  END IF;

  -- Enroll in program: nuevos entran como 'prospect'; no degradar 'active' o 'inactive'
  INSERT INTO public.client_programs (client_id, program_id, status)
  VALUES (_client_id, _program_id, 'prospect')
  ON CONFLICT (client_id, program_id) DO UPDATE
    SET status = CASE
      WHEN public.client_programs.status IN ('active','inactive') THEN public.client_programs.status
      WHEN public.client_programs.status = 'cancelled' THEN 'prospect'::client_program_status
      ELSE EXCLUDED.status
    END;

  SELECT id INTO _policy_id FROM public.policies WHERE folio = _folio;
  IF _policy_id IS NULL THEN
    INSERT INTO public.policies (folio, program_id, client_id, issue_date, start_date, end_date,
                                 sum_insured, premium, status, sales_rep_id, metadata)
    VALUES (_folio, _program_id, _client_id, _issue_date, _start_date, _end_date,
            _sum_insured, _premium, 'active', _sales_rep_id,
            jsonb_build_object('source','sheet_sync','sheet_id',_sheet_id,'row_number',_row_number))
    RETURNING id INTO _policy_id;
    _is_new_policy := true;
  ELSE
    UPDATE public.policies SET
      client_id   = _client_id,
      program_id  = _program_id,
      issue_date  = COALESCE(_issue_date, issue_date),
      start_date  = COALESCE(_start_date, start_date),
      end_date    = COALESCE(_end_date, end_date),
      sum_insured = COALESCE(_sum_insured, sum_insured),
      premium     = COALESCE(_premium, premium),
      sales_rep_id = COALESCE(sales_rep_id, _sales_rep_id)
    WHERE id = _policy_id;
  END IF;

  DELETE FROM public.beneficiaries WHERE policy_id = _policy_id AND (metadata->>'source')='sheet_sync';
  FOR _ben_idx IN 1..5 LOOP
    _ben := nullif(btrim(coalesce(_row_data->>('beneficiary_'||_ben_idx),'')), '');
    IF _ben IS NOT NULL THEN
      INSERT INTO public.beneficiaries (policy_id, full_name, display_order, metadata)
      VALUES (_policy_id, _ben, _ben_idx, jsonb_build_object('source','sheet_sync'));
    END IF;
  END LOOP;

  IF _is_new_policy AND _email IS NOT NULL THEN
    INSERT INTO public.notifications (channel, recipient, template_code, payload, status)
    VALUES ('email', _email, 'policy_welcome',
            jsonb_build_object('client_id',_client_id,'policy_id',_policy_id,'folio',_folio,'program',_program),
            'queued');
  END IF;

  _action := CASE WHEN _existing_hash IS NULL THEN 'synced_new' ELSE 'synced_updated' END;

  INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, folio, client_id, policy_id, status, raw_data, error_message)
  VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, _client_id, _policy_id, _action, _row_data,
          CASE WHEN _curp_pending THEN 'CURP pendiente: registro creado con CURP provisional' ELSE NULL END)
  ON CONFLICT (sheet_id, row_number) DO UPDATE
    SET row_hash = EXCLUDED.row_hash, folio = EXCLUDED.folio,
        client_id = EXCLUDED.client_id, policy_id = EXCLUDED.policy_id,
        status = EXCLUDED.status, raw_data = EXCLUDED.raw_data,
        error_message = EXCLUDED.error_message, last_synced_at = now();

  RETURN jsonb_build_object(
    'action', _action,
    'client_id', _client_id,
    'policy_id', _policy_id,
    'is_new_client', _is_new_client,
    'is_new_policy', _is_new_policy,
    'curp_pending', _curp_pending
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, folio, status, error_message, raw_data)
  VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, 'failed', SQLERRM, _row_data)
  ON CONFLICT (sheet_id, row_number) DO UPDATE
    SET row_hash = EXCLUDED.row_hash, status='failed', error_message = EXCLUDED.error_message,
        raw_data = EXCLUDED.raw_data, last_synced_at = now(), folio = EXCLUDED.folio;
  RETURN jsonb_build_object('action','failed','reason',SQLERRM);
END $function$;