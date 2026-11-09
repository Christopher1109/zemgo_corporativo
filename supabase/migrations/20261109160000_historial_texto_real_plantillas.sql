-- Historial de Mensajes: mostrar el texto COMPLETO de las plantillas aprobadas en Meta
-- (recordatorio_pago_abc y recordatorio_pago_futcare), en lugar del resumen anterior.
-- También corrige los mensajes ya guardados en el historial con esas plantillas.

CREATE OR REPLACE FUNCTION public.reminder_template_body(p jsonb, v_tpl text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_amount text; v_date text; v_name text;
BEGIN
  v_name := COALESCE(p->>'var1_first_name', '');
  v_amount := COALESCE(to_char(NULLIF(p->>'var3_amount','')::numeric, 'FM999,999,990.##'), p->>'var3_amount', '');
  v_amount := rtrim(v_amount, '.');
  v_date := COALESCE(p->>'var4_due_date', '');
  IF v_date ~ '^\d{4}-\d{2}-\d{2}' THEN v_date := to_char(v_date::date, 'DD/MM/YYYY'); END IF;

  IF v_tpl = 'recordatorio_pago_abc' THEN
    RETURN format(E'Hola, %s, ¡muy buen día!\n\n'
      || E'Gracias por confiar en nuestra protección ABC y permitirnos ser parte de tu tranquilidad y respaldo cuando más lo necesitas.\n\n'
      || E'Queremos seguir acompañándote con la seguridad que mereces. Por eso, te compartimos los detalles de tu próximo pago, para que puedas continuar disfrutando de todos los beneficios.\n\n'
      || E'💰 Pago mensual: $%s\n'
      || E'📅 Fecha límite de pago: %s\n\n'
      || E'Puedes realizar tu pago de manera fácil y segura directamente aquí: https://www.zemgoportal.com/portal/\n\n'
      || E'Estamos a tus órdenes. Que tengas un excelente día.', v_name, v_amount, v_date);
  ELSIF v_tpl = 'recordatorio_pago_futcare' THEN
    RETURN format(E'Hola, %s.\n\n'
      || E'Ha sido un gusto acompañarte durante este año. Sabemos que disfrutar de este deporte también significa estar preparado para cualquier imprevisto dentro y fuera de la cancha, así que muchas gracias por confiar en nuestra protección FUT-CARE.\n\n'
      || E'Queremos recordarte que, para continuar con la protección futbolera, es necesario realizar la renovación correspondiente el día:\n\n'
      || E'📅 Fecha límite de pago: %s\n'
      || E'💰 Pago anual: $%s\n\n'
      || E'Puedes realizar tu pago directo y seguro a través del siguiente enlace: https://www.zemgoportal.com/portal/\n\n'
      || E'Si tienes alguna duda o necesitas apoyo con tu renovación, estamos para ayudarte.', v_name, v_date, v_amount);
  END IF;
  RETURN NULL;
END $function$;

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

  v_body := public.reminder_template_body(p, v_tpl);

  IF v_body IS NULL THEN
    -- Plantilla anterior (payment_reminder): se deja igual que antes.
    v_amount := COALESCE(to_char(NULLIF(p->>'var3_amount','')::numeric, 'FM999,999,990'), p->>'var3_amount', '');
    v_date := COALESCE(p->>'var4_due_date', '');
    IF v_date ~ '^\d{4}-\d{2}-\d{2}' THEN v_date := to_char(v_date::date, 'DD/MM/YYYY'); END IF;
    v_origin := CASE WHEN COALESCE((p->>'manual')::boolean, false) THEN ' (enviado por el equipo)' ELSE ' (automático)' END;
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

-- Corregir el texto de los recordatorios ya guardados con las plantillas nuevas.
UPDATE public.whatsapp_messages w
   SET body = public.reminder_template_body(n.payload, w.raw_payload->>'template')
  FROM public.notifications n
 WHERE w.raw_payload->>'notification_id' = n.id::text
   AND w.raw_payload->>'template' IN ('recordatorio_pago_abc', 'recordatorio_pago_futcare');
