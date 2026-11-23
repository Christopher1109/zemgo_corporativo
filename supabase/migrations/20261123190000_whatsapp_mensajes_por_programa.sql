-- Mensajes de WhatsApp separados por programa.
-- Problema: un mismo teléfono puede ser de clientes en varios programas (p. ej. Zita en ABC y
-- sus hijos en FutCare). La pantalla asignaba cada número a UN solo programa, así que el
-- recordatorio de pago de ABC de Zita aparecía en Mensajes de FutCare.
-- Solución:
--   1) Cada mensaje guarda su programa (program_code) cuando se puede saber: los recordatorios
--      de pago por la plantilla (recordatorio_pago_abc / _futcare / _mcv) o por el pago al que van.
--   2) Las conversaciones y el hilo se piden por programa: se ven los mensajes de ese programa y
--      los que no tienen programa (bot, respuestas del cliente) cuando el número es de un
--      cliente de ese programa. Un número compartido aparece en cada programa con lo suyo.

ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS program_code text;
CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_program_idx ON public.whatsapp_messages(wa_phone, program_code);

CREATE OR REPLACE FUNCTION public.whatsapp_message_program(_raw jsonb)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    CASE
      WHEN _raw->>'template' ILIKE '%\_abc' THEN 'ABC'
      WHEN _raw->>'template' ILIKE '%\_futcare' THEN 'FUTCARE'
      WHEN _raw->>'template' ILIKE '%\_mcv' THEN 'MCV'
    END,
    (SELECT upper(pr.code) FROM public.payments pay
       JOIN public.policies po ON po.id = pay.policy_id
       JOIN public.programs pr ON pr.id = po.program_id
      WHERE pay.id::text = _raw->>'payment_id'
      LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_messages_set_program()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.program_code IS NULL AND NEW.raw_payload IS NOT NULL THEN
    NEW.program_code := public.whatsapp_message_program(NEW.raw_payload);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_whatsapp_messages_set_program ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_messages_set_program
  BEFORE INSERT OR UPDATE OF raw_payload ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_messages_set_program();

-- Mensajes ya guardados
UPDATE public.whatsapp_messages
   SET program_code = public.whatsapp_message_program(raw_payload)
 WHERE program_code IS NULL AND raw_payload IS NOT NULL
   AND public.whatsapp_message_program(raw_payload) IS NOT NULL;

-- Conversaciones. Con _program_code: las del programa + las de números sin cliente identificado.
-- Sin _program_code: comportamiento anterior (todas), para no romper nada mientras se publica.
DROP FUNCTION IF EXISTS public.get_whatsapp_conversations();
CREATE OR REPLACE FUNCTION public.get_whatsapp_conversations(_program_code text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prog text := upper(nullif(_program_code, ''));
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'no_autorizado';
  END IF;

  WITH phone_clients AS (
    -- Clientes de cada número, con sus programas
    SELECT DISTINCT p.wa_phone, c.id AS client_id, c.first_name, c.last_name, c.created_at,
           upper(pr.code) AS program_code, pr.name AS program_name, cp.status AS program_status
    FROM (SELECT DISTINCT wa_phone FROM public.whatsapp_messages) p
    JOIN public.clients c
      ON right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10) = right(regexp_replace(p.wa_phone, '[^0-9]', '', 'g'), 10)
    LEFT JOIN public.client_programs cp ON cp.client_id = c.id
    LEFT JOIN public.programs pr ON pr.id = cp.program_id
  ),
  visible AS (
    SELECT m.*
    FROM public.whatsapp_messages m
    WHERE v_prog IS NULL
       OR m.program_code = v_prog
       OR (m.program_code IS NULL AND (
             EXISTS (SELECT 1 FROM phone_clients pc WHERE pc.wa_phone = m.wa_phone AND pc.program_code = v_prog)
             OR NOT EXISTS (SELECT 1 FROM phone_clients pc WHERE pc.wa_phone = m.wa_phone)))
  ),
  recent AS (
    SELECT wa_phone, body, direction, created_at,
           row_number() OVER (PARTITION BY wa_phone ORDER BY created_at DESC) AS rn,
           count(*) OVER (PARTITION BY wa_phone) AS msg_count
    FROM visible
  ),
  last_msg AS (
    SELECT wa_phone, body AS last_body, direction AS last_direction, created_at AS last_at, msg_count
    FROM recent WHERE rn = 1
  ),
  matched AS (
    SELECT DISTINCT ON (lm.wa_phone)
      lm.wa_phone, pc.client_id, pc.first_name, pc.last_name,
      pc.program_status, pc.program_code, pc.program_name
    FROM last_msg lm
    LEFT JOIN phone_clients pc
      ON pc.wa_phone = lm.wa_phone AND (v_prog IS NULL OR pc.program_code = v_prog)
    ORDER BY lm.wa_phone,
      (pc.program_status = 'active') DESC NULLS LAST,
      pc.created_at DESC NULLS LAST
  )
  SELECT jsonb_agg(jsonb_build_object(
    'wa_phone', lm.wa_phone,
    'last_body', lm.last_body,
    'last_direction', lm.last_direction,
    'last_at', lm.last_at,
    'count', lm.msg_count,
    'client_id', m.client_id,
    'client_name', NULLIF(trim(concat_ws(' ', m.first_name, m.last_name)), ''),
    'program_code', m.program_code,
    'program_name', m.program_name,
    'program_status', m.program_status,
    'bot_paused_until', s.bot_paused_until,
    'needs_human', COALESCE(s.needs_human, false)
  ) ORDER BY COALESCE(s.needs_human, false) DESC, lm.last_at DESC)
  INTO v_result
  FROM last_msg lm
  LEFT JOIN matched m ON m.wa_phone = lm.wa_phone
  LEFT JOIN public.whatsapp_conversation_state s ON s.wa_phone = lm.wa_phone;

  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;

-- Hilo. Con _program_code se ocultan los mensajes marcados de OTRO programa.
DROP FUNCTION IF EXISTS public.get_whatsapp_thread(text);
CREATE OR REPLACE FUNCTION public.get_whatsapp_thread(_wa_phone text, _program_code text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prog text := upper(nullif(_program_code, ''));
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'no_autorizado';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', m.id,
    'direction', m.direction,
    'message_type', m.message_type,
    'body', m.body,
    'sent_by', m.sent_by,
    'sent_by_name', pf.full_name,
    'created_at', m.created_at
  ) ORDER BY m.created_at ASC)
  INTO v_result
  FROM public.whatsapp_messages m
  LEFT JOIN public.profiles pf ON pf.id = m.sent_by
  WHERE m.wa_phone = _wa_phone
    AND (v_prog IS NULL OR m.program_code IS NULL OR m.program_code = v_prog);

  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_conversations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_thread(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
