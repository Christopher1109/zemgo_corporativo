-- Recordatorios de pago con plantillas por programa (oct 2026):
--   ABC -> recordatorio_pago_abc, FUTCARE -> recordatorio_pago_futcare, resto -> payment_reminder.
-- Ajusta el texto que queda en el historial de Mensajes para que refleje
-- lo que realmente recibe el cliente.

CREATE OR REPLACE FUNCTION public.trg_reminder_to_whatsapp_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p jsonb := NEW.payload;
  v_key text; v_body text; v_amount text; v_date text; v_code text; v_tpl text; v_origin text;
BEGIN
  IF NEW.channel <> 'whatsapp' OR NEW.template_code <> 'PAYMENT_REMINDER_WHATSAPP' OR NEW.status <> 'sent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM whatsapp_messages WHERE raw_payload->>'notification_id' = NEW.id::text) THEN RETURN NEW; END IF;
  v_key := public.wa_conversation_key(COALESCE(p->>'to', NEW.recipient));
  IF v_key IS NULL THEN RETURN NEW; END IF;

  SELECT code INTO v_code FROM programs WHERE id::text = p->>'program_id';
  v_tpl := COALESCE(NULLIF(p->>'template',''),
                    CASE v_code WHEN 'ABC' THEN 'recordatorio_pago_abc'
                                WHEN 'FUTCARE' THEN 'recordatorio_pago_futcare'
                                ELSE 'payment_reminder' END);
  v_amount := COALESCE(to_char(NULLIF(p->>'var3_amount','')::numeric, 'FM999,999,990'), p->>'var3_amount', '');
  v_date := COALESCE(p->>'var4_due_date', '');
  IF v_date ~ '^\d{4}-\d{2}-\d{2}' THEN v_date := to_char(v_date::date, 'DD/MM/YYYY'); END IF;
  v_origin := CASE WHEN COALESCE((p->>'manual')::boolean, false) THEN ' (enviado por el equipo)' ELSE ' (automático)' END;

  IF v_tpl = 'recordatorio_pago_abc' THEN
    v_body := format(E'🔔 Recordatorio de pago ABC%s\nHola, %s, ¡muy buen día!\n💰 Pago mensual: $%s\n📅 Fecha límite de pago: %s\nhttps://www.zemgoportal.com/portal/',
                     v_origin, COALESCE(p->>'var1_first_name',''), v_amount, v_date);
  ELSIF v_tpl = 'recordatorio_pago_futcare' THEN
    v_body := format(E'🔔 Recordatorio de renovación FUT-CARE%s\nHola, %s.\n📅 Fecha límite de pago: %s\n💰 Pago anual: $%s\nhttps://www.zemgoportal.com/portal/',
                     v_origin, COALESCE(p->>'var1_first_name',''), v_date, v_amount);
  ELSE
    v_body := format(E'🔔 Recordatorio de pago%s\nHola %s, tu pago de %s por $%s MXN vence el %s. Puedes pagar en %s',
                     v_origin, COALESCE(p->>'var1_first_name',''), COALESCE(p->>'var2_program',''), v_amount,
                     v_date, COALESCE(p->>'var5_portal_link',''));
  END IF;

  INSERT INTO whatsapp_messages(wa_phone, direction, message_type, body, sent_by, client_id, raw_payload, created_at)
  VALUES (v_key, 'outbound', 'template', v_body,
          NULLIF(p->>'sent_by','')::uuid, NULLIF(p->>'client_id','')::uuid,
          jsonb_build_object('notification_id', NEW.id, 'template', v_tpl, 'payment_id', p->>'payment_id'),
          COALESCE(NEW.sent_at, now()));
  RETURN NEW;
END $function$;
