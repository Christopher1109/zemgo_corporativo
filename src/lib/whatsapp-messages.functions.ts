import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Los teléfonos en `clients.phone` están a 10 dígitos, sin código de país.
// Los que llegan de Meta (`wa_phone`) traen código de país (ej. "528117637243").
// Comparamos por los últimos 10 dígitos para encontrar al cliente dueño del número.
function last10(phone: string): string {
  return phone.replace(/[^\d]/g, "").slice(-10);
}

export const listWhatsappConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;

    // Últimos 500 mensajes es suficiente para armar la lista de conversaciones
    // recientes sin tener que agregar en SQL crudo.
    const { data: rows, error } = await sb
      .from("whatsapp_messages")
      .select("wa_phone, body, direction, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const byPhone = new Map<
      string,
      { wa_phone: string; last_body: string | null; last_direction: string; last_at: string; count: number }
    >();
    for (const r of rows ?? []) {
      const existing = byPhone.get(r.wa_phone);
      if (existing) {
        existing.count += 1;
      } else {
        byPhone.set(r.wa_phone, {
          wa_phone: r.wa_phone,
          last_body: r.body,
          last_direction: r.direction,
          last_at: r.created_at,
          count: 1,
        });
      }
    }

    const conversations = Array.from(byPhone.values()).sort(
      (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
    );

    // Empareja cada conversación con un cliente conocido, si existe.
    const last10s = conversations.map((c) => last10(c.wa_phone));
    const { data: clients } = last10s.length
      ? await sb.from("clients").select("id, first_name, last_name, phone").in("phone", last10s)
      : { data: [] as any[] };
    const clientByPhone = new Map((clients ?? []).map((c: any) => [c.phone, c]));

    return conversations.map((c) => {
      const client = clientByPhone.get(last10(c.wa_phone));
      return {
        ...c,
        client_id: client?.id ?? null,
        client_name: client ? [client.first_name, client.last_name].filter(Boolean).join(" ") : null,
      };
    });
  });

export const listWhatsappThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { wa_phone: string }) => z.object({ wa_phone: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("whatsapp_messages")
      .select("id, direction, message_type, body, sent_by, created_at, profiles(full_name)")
      .eq("wa_phone", data.wa_phone)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; body: string }) =>
    z.object({ to: z.string().min(5), body: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.functions.invoke("whatsapp-send", {
      body: { to: data.to, body: data.body },
    });
    if (error) throw new Error(error.message);
    if (res?.error) throw new Error(res.error);
    return { ok: true };
  });
