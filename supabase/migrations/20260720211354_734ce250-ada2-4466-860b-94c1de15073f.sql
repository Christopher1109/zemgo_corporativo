
-- 1) process_sheet_row: nuevos clientes entran como 'prospect'; no degradar los ya 'active'
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
  _first_name text;
  _last_name text;
  _email text;
  _phone text;
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

  _curp := upper(nullif(btrim(coalesce(_row_data->>'curp','')), ''));
  IF _curp IS NULL OR NOT public.is_valid_curp(_curp) THEN
    INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, folio, status, error_message, raw_data)
    VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, 'failed', 'CURP inválida: '||coalesce(_curp,'(vacía)'), _row_data)
    ON CONFLICT (sheet_id, row_number) DO UPDATE
      SET row_hash = EXCLUDED.row_hash, status='failed', error_message = EXCLUDED.error_message,
          raw_data = EXCLUDED.raw_data, last_synced_at = now(), folio = EXCLUDED.folio;
    RETURN jsonb_build_object('action','failed','reason','invalid_curp');
  END IF;

  _first_name := nullif(btrim(coalesce(_row_data->>'first_name','')), '');
  _last_name  := nullif(btrim(coalesce(_row_data->>'last_name','')), '');
  IF _first_name IS NULL THEN _first_name := '(sin nombre)'; END IF;
  IF _last_name  IS NULL THEN _last_name  := '(sin apellido)'; END IF;
  _email   := lower(nullif(btrim(coalesce(_row_data->>'email','')), ''));
  _phone   := nullif(btrim(coalesce(_row_data->>'phone','')), '');
  _gender  := nullif(btrim(coalesce(_row_data->>'gender','')), '');
  _address := nullif(btrim(coalesce(_row_data->>'address','')), '');
  _vendor  := nullif(btrim(coalesce(_row_data->>'vendor','')), '');
  BEGIN _dob := (_row_data->>'date_of_birth')::date; EXCEPTION WHEN OTHERS THEN _dob := NULL; END;
  BEGIN _start_date := (_row_data->>'start_date')::date; EXCEPTION WHEN OTHERS THEN _start_date := NULL; END;
  BEGIN _end_date := (_row_data->>'end_date')::date; EXCEPTION WHEN OTHERS THEN _end_date := NULL; END;
  BEGIN _issue_date := (_row_data->>'issue_date')::date; EXCEPTION WHEN OTHERS THEN _issue_date := _start_date; END;
  BEGIN _sum_insured := (_row_data->>'sum_insured')::numeric; EXCEPTION WHEN OTHERS THEN _sum_insured := NULL; END;
  BEGIN _premium := (_row_data->>'premium')::numeric; EXCEPTION WHEN OTHERS THEN _premium := NULL; END;

  _sales_rep_id := public.upsert_sales_rep_by_name(_vendor);

  SELECT id INTO _client_id FROM public.clients WHERE curp = _curp;
  IF _client_id IS NULL THEN
    INSERT INTO public.clients (first_name, last_name, curp, email, phone, date_of_birth, gender, address_full, sales_rep_id, metadata)
    VALUES (_first_name, _last_name, _curp, _email, _phone, _dob, _gender, _address, _sales_rep_id,
            jsonb_build_object('source','sheet_sync','sheet_id',_sheet_id))
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
      sales_rep_id = COALESCE(_sales_rep_id, sales_rep_id)
    WHERE id = _client_id;
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
                                 sum_insured, premium, status, metadata)
    VALUES (_folio, _program_id, _client_id, _issue_date, _start_date, _end_date,
            _sum_insured, _premium, 'active',
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
      premium     = COALESCE(_premium, premium)
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
  VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, _client_id, _policy_id, _action, _row_data, NULL)
  ON CONFLICT (sheet_id, row_number) DO UPDATE
    SET row_hash = EXCLUDED.row_hash, folio = EXCLUDED.folio,
        client_id = EXCLUDED.client_id, policy_id = EXCLUDED.policy_id,
        status = EXCLUDED.status, raw_data = EXCLUDED.raw_data,
        error_message = NULL, last_synced_at = now();

  RETURN jsonb_build_object(
    'action', _action,
    'client_id', _client_id,
    'policy_id', _policy_id,
    'is_new_client', _is_new_client,
    'is_new_policy', _is_new_policy
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.sheet_synced_rows (sheet_id, sheet_program, row_number, row_hash, folio, status, error_message, raw_data)
  VALUES (_sheet_id, _program, _row_number, _row_hash, _folio, 'failed', SQLERRM, _row_data)
  ON CONFLICT (sheet_id, row_number) DO UPDATE
    SET row_hash = EXCLUDED.row_hash, status='failed', error_message = EXCLUDED.error_message,
        raw_data = EXCLUDED.raw_data, last_synced_at = now(), folio = EXCLUDED.folio;
  RETURN jsonb_build_object('action','failed','reason',SQLERRM);
END $function$;

-- 2) mark_payment_paid: promover client_programs 'prospect' -> 'active' (o 'inactive' -> 'active')
CREATE OR REPLACE FUNCTION public.mark_payment_paid(_payment_id uuid, _method payment_method, _paid_at timestamp with time zone, _reference text, _paid_amount numeric, _notes text, _amount_change_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments;
  v_policy public.policies;
  v_schedule public.payment_schedules;
  v_next_due date;
  v_user uuid := auth.uid();
  v_new_payment_id uuid;
  v_cp_updated boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = v_payment.policy_id;

  IF NOT public.has_program_role(v_user, v_policy.program_id, ARRAY['admin','manager','operator']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_payment.status = 'paid' THEN
    RAISE EXCEPTION 'already_paid:%', v_payment.paid_at;
  END IF;

  IF _paid_at > now() THEN RAISE EXCEPTION 'paid_at_cannot_be_future'; END IF;

  IF _method IN ('bank_transfer','bank_reference') AND (_reference IS NULL OR length(trim(_reference)) = 0) THEN
    RAISE EXCEPTION 'reference_required';
  END IF;

  UPDATE public.payments SET
    status = 'paid', paid_at = _paid_at, method = _method,
    paid_amount = COALESCE(_paid_amount, amount),
    bank_reference = COALESCE(_reference, bank_reference),
    notes = _notes, provider = COALESCE(provider, 'MANUAL'), updated_at = now()
  WHERE id = _payment_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'payments', _payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('method', _method, 'paid_at', _paid_at,
      'amount', COALESCE(_paid_amount, v_payment.amount),
      'original_amount', v_payment.amount,
      'amount_change_reason', _amount_change_reason, 'reference', _reference));

  IF v_payment.payment_schedule_id IS NOT NULL THEN
    SELECT * INTO v_schedule FROM public.payment_schedules WHERE id = v_payment.payment_schedule_id;
    IF v_schedule.is_recurring AND v_schedule.frequency = 'monthly' THEN
      v_next_due := (v_payment.due_date + INTERVAL '1 month')::date;
      IF NOT EXISTS (
        SELECT 1 FROM public.payments
        WHERE policy_id = v_payment.policy_id AND due_date = v_next_due AND payment_schedule_id = v_schedule.id
      ) THEN
        INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
        VALUES (v_payment.policy_id, v_schedule.amount, v_next_due, 'pending', v_schedule.id)
        RETURNING id INTO v_new_payment_id;
      END IF;
      UPDATE public.payment_schedules SET next_due_date = v_next_due WHERE id = v_schedule.id;
    END IF;
  END IF;

  IF v_policy.status = 'suspended' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE policy_id = v_policy.id AND status IN ('overdue','pending') AND due_date < CURRENT_DATE
    ) THEN
      UPDATE public.policies SET status='active', updated_at=now() WHERE id = v_policy.id;
      INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
      VALUES (v_user, v_policy.program_id, 'policy', v_policy.id, 'status:suspended->active',
        jsonb_build_object('from','suspended','to','active','reason','overdue_paid'));
    END IF;
  END IF;

  -- Promover cliente en el programa: prospect/inactive -> active
  UPDATE public.client_programs
    SET status = 'active'
  WHERE client_id = v_policy.client_id
    AND program_id = v_policy.program_id
    AND status IN ('prospect','inactive');
  GET DIAGNOSTICS v_cp_updated = ROW_COUNT;
  IF v_cp_updated THEN
    INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
    VALUES (v_user, v_policy.program_id, 'client_programs', v_policy.client_id,
      'CLIENT_PROGRAM_ACTIVATED', jsonb_build_object('reason','payment_registered','payment_id',_payment_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'next_payment_id', v_new_payment_id);
END;
$function$;

-- 3) run_payment_housekeeping: marcar client_programs.inactive cuando la póliza cae por >30 días vencidos
CREATE OR REPLACE FUNCTION public.run_payment_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overdue int := 0;
  v_reminders int := 0;
  v_suspended int := 0;
  v_created int := 0;
  v_inactivated int := 0;
  r record;
BEGIN
  UPDATE public.payments SET status='overdue', updated_at=now()
   WHERE status='pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  FOR r IN
    SELECT p.id AS payment_id, p.policy_id, p.amount, p.due_date,
           pol.client_id, pol.program_id,
           pr.name AS program_name, pr.payment_alert_offsets AS offsets,
           c.first_name, c.last_name, c.email, c.phone
    FROM public.payments p
    JOIN public.policies pol ON pol.id = p.policy_id
    JOIN public.programs pr ON pr.id = pol.program_id
    JOIN public.clients c ON c.id = pol.client_id
    WHERE p.status = 'pending'
      AND (p.due_date - CURRENT_DATE) = ANY(pr.payment_alert_offsets)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.template_code = 'PAYMENT_REMINDER'
        AND (n.payload->>'payment_id') = r.payment_id::text
        AND (n.payload->>'offset_days') = (r.due_date - CURRENT_DATE)::text
    ) THEN
      INSERT INTO public.notifications(channel, recipient, template_code, payload, status)
      VALUES ('in_app',
        COALESCE(NULLIF(r.email,''), NULLIF(r.phone,''), 'in_app'),
        'PAYMENT_REMINDER',
        jsonb_build_object('payment_id', r.payment_id, 'policy_id', r.policy_id,
          'client_id', r.client_id, 'program_id', r.program_id,
          'offset_days', (r.due_date - CURRENT_DATE),
          'body', format('Hola %s, tu pago de $%s del programa %s vence el %s (en %s días).',
                  r.first_name, r.amount::text, r.program_name,
                  to_char(r.due_date, 'YYYY-MM-DD'), (r.due_date - CURRENT_DATE)::text)),
        'pending');
      v_reminders := v_reminders + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT pol.id, pol.program_id, pol.client_id
    FROM public.policies pol
    JOIN public.payments p ON p.policy_id = pol.id
    WHERE pol.status='active' AND p.status='overdue'
      AND p.due_date < CURRENT_DATE - INTERVAL '30 days'
  LOOP
    UPDATE public.policies SET status='suspended', updated_at=now() WHERE id = r.id;
    INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
    VALUES (r.program_id, 'policy', r.id, 'POLICY_AUTO_SUSPENDED',
            jsonb_build_object('reason','payment_overdue_30_days'));
    v_suspended := v_suspended + 1;

    -- Marcar client_programs como inactive si el cliente no tiene otras pólizas activas en el mismo programa
    IF NOT EXISTS (
      SELECT 1 FROM public.policies p2
      WHERE p2.client_id = r.client_id AND p2.program_id = r.program_id
        AND p2.id <> r.id AND p2.status = 'active'
    ) THEN
      UPDATE public.client_programs
        SET status='inactive'
      WHERE client_id = r.client_id AND program_id = r.program_id AND status = 'active';
      IF FOUND THEN
        v_inactivated := v_inactivated + 1;
        INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
        VALUES (r.program_id, 'client_programs', r.client_id, 'CLIENT_PROGRAM_INACTIVATED',
                jsonb_build_object('reason','payment_overdue_30_days','policy_id',r.id));
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT s.id AS schedule_id, s.policy_id, s.amount, s.next_due_date
    FROM public.payment_schedules s
    WHERE s.is_recurring = true AND s.next_due_date IS NOT NULL
      AND s.next_due_date <= CURRENT_DATE + INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.payment_schedule_id = s.id AND p.due_date = s.next_due_date
      )
  LOOP
    INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
    VALUES (r.policy_id, r.amount, r.next_due_date, 'pending', r.schedule_id);
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('overdue', v_overdue, 'reminders', v_reminders,
                            'suspended', v_suspended, 'created', v_created,
                            'inactivated', v_inactivated);
END $function$;
