-- El plan de pagos usa el precio del certificado y, si no tiene, el precio vigente del programa
-- (programs.default_premium, editable en Configuración). Antes FutCare/MCV quedaban en $0.
CREATE OR REPLACE FUNCTION public.create_payment_schedule_for_policy(_policy_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_program_code text;
  v_premium numeric(14,2);
  v_default numeric(14,2);
  v_start_date date;
  v_company uuid;
  v_amount numeric(14,2);
  v_is_recurring boolean;
  v_frequency payment_frequency;
  v_schedule_id uuid;
BEGIN
  SELECT pr.code, p.premium, pr.default_premium, p.start_date, p.company_id
    INTO v_program_code, v_premium, v_default, v_start_date, v_company
  FROM public.policies p
  JOIN public.programs pr ON pr.id = p.program_id
  WHERE p.id = _policy_id;

  IF v_program_code IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF v_company IS NOT NULL THEN RETURN NULL; END IF;
  IF v_start_date IS NULL THEN v_start_date := CURRENT_DATE; END IF;

  v_amount := COALESCE(v_premium, v_default, 0);
  IF upper(v_program_code) = 'ABC' THEN
    v_is_recurring := true;
    v_frequency := 'monthly';
  ELSIF upper(v_program_code) = 'FUTCARE' THEN
    v_is_recurring := false;
    v_frequency := 'one_time';
  ELSE
    v_is_recurring := true;
    v_frequency := 'monthly';
  END IF;

  SELECT id INTO v_schedule_id FROM public.payment_schedules WHERE policy_id = _policy_id LIMIT 1;
  IF v_schedule_id IS NOT NULL THEN
    RETURN v_schedule_id;
  END IF;

  INSERT INTO public.payment_schedules(policy_id, is_recurring, frequency, amount, next_due_date, auto_charge, reminder_days_before)
  VALUES (_policy_id, v_is_recurring, v_frequency, v_amount, v_start_date, false, 10)
  RETURNING id INTO v_schedule_id;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE policy_id = _policy_id AND due_date = v_start_date) THEN
    INSERT INTO public.payments(policy_id, amount, due_date, status, payment_schedule_id)
    VALUES (_policy_id, v_amount, v_start_date, 'pending', v_schedule_id);
  END IF;

  RETURN v_schedule_id;
END;
$function$;
