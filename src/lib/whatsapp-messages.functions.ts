import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WhatsappConversation {
  wa_phone: string;
  last_body: string | null;
  last_direction: "inbound" | "outbound";
  last_at: string;
  count: number;
  client_id: string | null;
  client_name: string | null;
  program_code: string | null;
  program_name: string | null;
  program_status: string | null;
  bot_paused_until: string | null;
  needs_human: boolean;
}

export interface WhatsappThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  created_at: string;
}

// Las tres consultas usan funciones SECURITY DEFINER (get_whatsapp_*) en vez
// de leer las tablas directo: el módulo "messages" no incluye acceso a
// `clients`/`profiles` vía RLS (esas políticas solo revisan los módulos
// clients/policies/payments/finance/incidents/reports), así que sin esto la
// pantalla se quedaba "cargando" para cualquiera que no tuviera además el
// módulo "clients". Las funciones validan por su cuenta que quien llama
// tenga un perfil de personal — no exponen nada a quien no debería verlo.

export const listWhatsappConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappConversation[]> => {
    const { data, error } = await context.supabase.rpc("get_whatsapp_conversations");
    if (error) throw new Error(error.message);
    return (data as unknown as WhatsappConversation[]) ?? [];
  });

export const listWhatsappThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { wa_phone: string }) => z.object({ wa_phone: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }): Promise<WhatsappThreadMessage[]> => {
    const { data: rows, error } = await context.supabase.rpc("get_whatsapp_thread", {
      _wa_phone: data.wa_phone,
    });
    if (error) throw new Error(error.message);
    return (rows as unknown as WhatsappThreadMessage[]) ?? [];
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

export const resumeWhatsappBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { wa_phone: string }) => z.object({ wa_phone: z.string().min(5) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("resume_whatsapp_bot", { _wa_phone: data.wa_phone });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
