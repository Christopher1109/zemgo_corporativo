// Recordatorios de pago por WhatsApp para torneos/equipos de FutCare.
// Usa la plantilla aprobada `payment_reminder` (la misma de resend-payment-reminder) con la
// línea de WhatsApp de FUTCARE. Modo "Paga el encargado": solo al encargado.
// Modo "Cada quien paga": a cada asegurado con su pago pendiente.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v22.0";
const PORTAL_URL = "https://www.zemgoportal.com/portal/payments";

function toWaPhone(raw?: string | null) {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return d.length >= 10 ? d : null;
}

function longDate(iso?: string | null) {
  if (!iso) return "próximamente";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function money(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MXN anual`;
}

type Target = { name: string; phone: string | null; payment_id: string; amount: number; due_date: string | null; client_id?: string | null };

export const sendGroupPaymentReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        /** Solo para modo individual: limitar a estos pagos. Vacío = todos los pendientes. */
        payment_ids: z.array(z.string().uuid()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: company, error: cErr } = await (supabase.from("companies") as any)
      .select("id, program_id, legal_name, billing_mode, contact_name, phone, contact_client_id, programs(code, name)")
      .eq("id", data.company_id)
      .single();
    if (cErr || !company) throw new Error("Grupo no encontrado.");

    const { data: superAdmin } = await (supabase.rpc as any)("is_super_admin", { _user_id: userId });
    if (!superAdmin) {
      const { data: acc } = await supabase
        .from("user_program_access")
        .select("role")
        .eq("user_id", userId)
        .eq("program_id", company.program_id)
        .in("role", ["admin", "manager"])
        .limit(1);
      if (!(acc ?? []).length) throw new Error("Solo administradores o managers del programa pueden enviar recordatorios.");
    }

    const programName = company.programs?.name ?? "FutCare";
    const targets: Target[] = [];

    if (company.billing_mode === "company") {
      const { data: pay } = await (supabase.from("payments") as any)
        .select("id, amount, due_date, status")
        .eq("company_id", company.id)
        .is("policy_id", null)
        .in("status", ["pending", "overdue"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pay) throw new Error("El grupo no tiene un cobro pendiente.");
      targets.push({
        name: company.contact_name ?? company.legal_name,
        phone: company.phone,
        payment_id: pay.id,
        amount: Number(pay.amount),
        due_date: pay.due_date,
        client_id: company.contact_client_id,
      });
    } else {
      const { data: pols } = await supabase
        .from("policies")
        .select("id, client_id, clients(first_name, last_name, phone, payer_phone)")
        .eq("company_id", company.id)
        .neq("status", "cancelled");
      const polIds = (pols ?? []).map((p: any) => p.id);
      if (!polIds.length) return { sent: [], failed: [], noPhone: [] };
      let pq = supabase
        .from("payments")
        .select("id, policy_id, amount, due_date, status")
        .in("policy_id", polIds)
        .in("status", ["pending", "overdue"]);
      if (data.payment_ids?.length) pq = pq.in("id", data.payment_ids);
      const { data: pays } = await pq;
      const byPol = new Map((pols ?? []).map((p: any) => [p.id, p]));
      for (const p of pays ?? []) {
        const pol: any = byPol.get(p.policy_id);
        const c = pol?.clients;
        targets.push({
          name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
          phone: c?.phone || c?.payer_phone || null,
          payment_id: p.id,
          amount: Number(p.amount),
          due_date: p.due_date,
          client_id: pol?.client_id,
        });
      }
    }

    const noPhone = targets.filter((t) => !toWaPhone(t.phone)).map((t) => ({ name: t.name, payment_id: t.payment_id }));
    const sendable = targets.filter((t) => toWaPhone(t.phone));
    if (!sendable.length) return { sent: [], failed: [], noPhone };

    const token = process.env["WHATSAPP_ACCESS_TOKEN_FUTCARE"];
    if (!token) {
      throw new Error(
        "Falta configurar el token de WhatsApp de FutCare (WHATSAPP_ACCESS_TOKEN_FUTCARE) en los secretos del proyecto.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: line } = await supabaseAdmin
      .from("whatsapp_lines")
      .select("phone_number_id")
      .eq("program_code", "FUTCARE")
      .maybeSingle();
    if (!line?.phone_number_id) throw new Error("La línea de WhatsApp de FutCare no tiene número configurado.");

    const sent: { name: string; to: string }[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const t of sendable) {
      const to = toWaPhone(t.phone)!;
      const params = [t.name || "cliente", programName, programName, money(t.amount), longDate(t.due_date), PORTAL_URL];
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${line.phone_number_id}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: "payment_reminder",
            language: { code: "es_MX" },
            components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
          },
        }),
      });
      const ok = res.ok;
      const body = ok ? "" : await res.text();
      if (ok) sent.push({ name: t.name, to });
      else failed.push({ name: t.name, error: `WhatsApp respondió ${res.status}: ${body.slice(0, 200)}` });
      await supabaseAdmin.from("notifications").insert({
        channel: "whatsapp",
        recipient: to,
        template_code: "PAYMENT_REMINDER_WHATSAPP",
        payload: {
          payment_id: t.payment_id,
          company_id: company.id,
          client_id: t.client_id ?? null,
          manual: true,
          sent_by: userId,
          group: true,
          ...(ok ? {} : { error: body.slice(0, 500) }),
        },
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
      } as any);
    }
    return { sent, failed, noPhone };
  });
