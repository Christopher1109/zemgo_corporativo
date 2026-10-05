-- Mensajes → "Recordatorios de pago": bitácora de los recordatorios de WhatsApp (automáticos y manuales)
-- y su resultado (¿pagó?, ¿respondió?). Además, cada recordatorio enviado queda dentro de la
-- conversación de WhatsApp del cliente para ver qué pasó después.

-- 1) Normaliza un teléfono a la llave de conversación que ya usa whatsapp_messages.
--    Si ya hay conversación con ese número (mismos 10 dígitos), se usa esa; si no, el formato
--    con el que llegan los mensajes de México (521 + 10 dígitos).
CREATE OR REPLACE FUNCTION public.wa_conversation_key(_phone text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT m.wa_phone FROM whatsapp_messages m
      WHERE right(regexp_replace(m.wa_phone, '\D', '', 'g'), 10) = right(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), 10)
      ORDER BY m.created_at DESC LIMIT 1),
    CASE WHEN length(regexp_replace(coalesce(_phone,''), '\D', '', 'g')) >= 10
         THEN '521' || right(regexp_replace(_phone, '\D', '', 'g'), 10) END);
$$;

-- 2) Cada recordatorio enviado se copia como mensaje saliente de la conversación.
CREATE OR REPLACE FUNCTION public.trg_reminder_to_whatsapp_messages()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p jsonb := NEW.payload; v_key text; v_body text; v_amount text;
BEGIN
  IF NEW.channel <> 'whatsapp' OR NEW.template_code <> 'PAYMENT_REMINDER_WHATSAPP' OR NEW.status <> 'sent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM whatsapp_messages WHERE raw_payload->>'notification_id' = NEW.id::text) THEN RETURN NEW; END IF;
  v_key := public.wa_conversation_key(COALESCE(p->>'to', NEW.recipient));
  IF v_key IS NULL THEN RETURN NEW; END IF;
  v_amount := to_char(NULLIF(p->>'var3_amount','')::numeric, 'FM999,999,990');
  v_body := format(E'🔔 Recordatorio de pago%s\nHola %s, tu pago de %s por $%s MXN vence el %s. Puedes pagar en %s',
                   CASE WHEN COALESCE((p->>'manual')::boolean, false) THEN ' (enviado por el equipo)' ELSE ' (automático)' END,
                   COALESCE(p->>'var1_first_name',''), COALESCE(p->>'var2_program',''), COALESCE(v_amount, p->>'var3_amount', ''),
                   COALESCE(p->>'var4_due_date',''), COALESCE(p->>'var5_portal_link',''));
  INSERT INTO whatsapp_messages(wa_phone, direction, message_type, body, sent_by, client_id, raw_payload, created_at)
  VALUES (v_key, 'outbound', 'template', v_body,
          NULLIF(p->>'sent_by','')::uuid, NULLIF(p->>'client_id','')::uuid,
          jsonb_build_object('notification_id', NEW.id, 'template', 'payment_reminder', 'payment_id', p->>'payment_id'),
          COALESCE(NEW.sent_at, now()));
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER reminder_to_whatsapp_messages
  AFTER INSERT OR UPDATE OF status ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_reminder_to_whatsapp_messages();

-- 3) Bitácora para la pantalla: un renglón por recordatorio, con cliente, pago y resultado.
CREATE OR REPLACE FUNCTION public.get_payment_reminder_log(_program_code text, _days int DEFAULT 90)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'no_autorizado'; END IF;
  WITH n AS (
    SELECT n.*, pr.code AS program_code, pr.name AS program_name
      FROM notifications n
      LEFT JOIN programs pr ON pr.id = NULLIF(n.payload->>'program_id','')::uuid
     WHERE n.channel = 'whatsapp' AND n.template_code = 'PAYMENT_REMINDER_WHATSAPP'
       AND n.created_at > now() - make_interval(days => GREATEST(_days, 1))
       AND (upper(coalesce(pr.code,'')) = upper(coalesce(_program_code,'')))
  ), rows AS (
    SELECT n.id, n.created_at, n.sent_at, n.status, n.program_code,
           COALESCE((n.payload->>'manual')::boolean, false) AS manual,
           pf.full_name AS sent_by_name,
           COALESCE(n.payload->>'to', n.recipient) AS phone,
           public.wa_conversation_key(COALESCE(n.payload->>'to', n.recipient)) AS wa_phone,
           c.id AS client_id, NULLIF(trim(concat_ws(' ', c.first_name, c.last_name)), '') AS client_name,
           pay.id AS payment_id, pay.amount, pay.due_date, pay.status AS payment_status, pay.paid_at, pay.method,
           pol.folio
      FROM n
      LEFT JOIN payments pay ON pay.id = NULLIF(n.payload->>'payment_id','')::uuid
      LEFT JOIN policies pol ON pol.id = pay.policy_id
      LEFT JOIN clients c ON c.id = COALESCE(NULLIF(n.payload->>'client_id','')::uuid, pol.client_id)
      LEFT JOIN profiles pf ON pf.id = NULLIF(n.payload->>'sent_by','')::uuid
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'sent_at', r.sent_at, 'status', r.status, 'manual', r.manual,
      'sent_by_name', r.sent_by_name, 'phone', r.phone, 'wa_phone', r.wa_phone,
      'client_id', r.client_id, 'client_name', r.client_name, 'folio', r.folio,
      'payment_id', r.payment_id, 'amount', r.amount, 'due_date', r.due_date,
      'payment_status', r.payment_status, 'paid_at', r.paid_at, 'method', r.method,
      'replies', (SELECT count(*) FROM whatsapp_messages m WHERE m.wa_phone = r.wa_phone AND m.direction = 'inbound'
                   AND m.created_at > COALESCE(r.sent_at, r.created_at)),
      'last_reply', (SELECT jsonb_build_object('body', m.body, 'type', m.message_type, 'at', m.created_at)
                       FROM whatsapp_messages m WHERE m.wa_phone = r.wa_phone AND m.direction = 'inbound'
                        AND m.created_at > COALESCE(r.sent_at, r.created_at)
                       ORDER BY m.created_at DESC LIMIT 1)
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v FROM rows r;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.get_payment_reminder_log(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_reminder_log(text, int) TO authenticated;
REVOKE ALL ON FUNCTION public.wa_conversation_key(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wa_conversation_key(text) TO authenticated;
