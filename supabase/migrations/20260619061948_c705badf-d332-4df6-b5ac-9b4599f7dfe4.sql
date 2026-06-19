ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS payment_alert_offsets int[] NOT NULL DEFAULT '{15,30,60}';

UPDATE public.programs SET payment_alert_offsets = ARRAY[15,30,60]::int[]
  WHERE upper(code) IN ('ABC','MCV','MANOS','MANOSCONVALOR');
UPDATE public.programs SET payment_alert_offsets = ARRAY[30]::int[]
  WHERE upper(code) IN ('FUT','FUTCARE','FUT-CARE','FUT_CARE');

CREATE OR REPLACE FUNCTION public.update_program_alert_offsets(_program_id uuid, _offsets int[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_clean int[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_program_role(v_user, _program_id, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _offsets IS NULL OR array_length(_offsets,1) IS NULL THEN
    RAISE EXCEPTION 'offsets_required';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x)
    INTO v_clean
    FROM unnest(_offsets) x
    WHERE x BETWEEN 1 AND 365;
  IF v_clean IS NULL OR array_length(v_clean,1) = 0 THEN RAISE EXCEPTION 'invalid_offsets'; END IF;
  IF array_length(v_clean,1) > 10 THEN RAISE EXCEPTION 'too_many_offsets'; END IF;
  UPDATE public.programs SET payment_alert_offsets = v_clean WHERE id = _program_id;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, _program_id, 'programs', _program_id, 'ALERT_OFFSETS_UPDATED',
          jsonb_build_object('offsets', v_clean));
  RETURN jsonb_build_object('ok', true, 'offsets', v_clean);
END $$;

CREATE OR REPLACE FUNCTION public.run_payment_housekeeping()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_overdue int := 0;
  v_reminders int := 0;
  v_suspended int := 0;
  v_created int := 0;
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
      VALUES (
        'in_app',
        COALESCE(NULLIF(r.email,''), NULLIF(r.phone,''), 'in_app'),
        'PAYMENT_REMINDER',
        jsonb_build_object(
          'payment_id', r.payment_id,
          'policy_id', r.policy_id,
          'client_id', r.client_id,
          'program_id', r.program_id,
          'offset_days', (r.due_date - CURRENT_DATE),
          'body', format('Hola %s, tu pago de $%s del programa %s vence el %s (en %s días).',
                  r.first_name, r.amount::text, r.program_name,
                  to_char(r.due_date, 'YYYY-MM-DD'), (r.due_date - CURRENT_DATE)::text)
        ),
        'pending'
      );
      v_reminders := v_reminders + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT pol.id, pol.program_id
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
                            'suspended', v_suspended, 'created', v_created);
END $$;

CREATE OR REPLACE FUNCTION public.get_policies_by_state(_program_id uuid)
RETURNS TABLE(state text, total bigint, active bigint, suspended bigint, expired bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH access AS (
    SELECT program_id FROM public.user_program_access
    WHERE user_id = auth.uid()
      AND (_program_id IS NULL OR program_id = _program_id)
  )
  SELECT
    COALESCE(NULLIF(trim(c.state),''),'Desconocido') AS state,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE p.status='active')::bigint AS active,
    COUNT(*) FILTER (WHERE p.status='suspended')::bigint AS suspended,
    COUNT(*) FILTER (WHERE p.status='expired')::bigint AS expired
  FROM public.policies p
  JOIN public.clients c ON c.id = p.client_id
  WHERE p.program_id IN (SELECT program_id FROM access)
  GROUP BY 1
  ORDER BY total DESC;
$$;