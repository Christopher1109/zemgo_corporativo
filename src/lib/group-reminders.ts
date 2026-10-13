// Recordatorios de pago por WhatsApp para torneos/equipos de FutCare.
// El envío real lo hace la edge function de Supabase `send-group-reminders`
// (verifica permisos con RLS, manda por WhatsApp y registra en `notifications`).
// Este helper solo la invoca desde el navegador y normaliza la respuesta.
import { supabase } from "@/integrations/supabase/client";

const FALLBACK = "No se pudo enviar el recordatorio";

export type GroupReminderResponse = {
  sent: { name: string; to: string }[];
  failed: { name: string; error: string }[];
  noPhone: { name: string; payment_id: string }[];
};

export type GroupReminderResult =
  | ({ ok: true } & GroupReminderResponse)
  | { ok: false; error?: string; message: string };

export async function sendGroupPaymentReminders(input: {
  company_id: string;
  /** Solo modo individual: limitar a estos pagos. Vacío/omiso = todos los pendientes. */
  payment_ids?: string[];
}): Promise<GroupReminderResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-group-reminders", {
      body: { company_id: input.company_id, payment_ids: input.payment_ids },
    });
    if (error) {
      try {
        const body = await (error as any).context?.json();
        return { ok: false, error: body?.error, message: body?.message || FALLBACK };
      } catch {
        return { ok: false, message: FALLBACK };
      }
    }
    const d: any = data ?? {};
    if (d.ok === false) return { ok: false, error: d.error, message: d.message || FALLBACK };
    return {
      ok: true,
      sent: d.sent ?? [],
      failed: d.failed ?? [],
      noPhone: d.noPhone ?? [],
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || FALLBACK };
  }
}
