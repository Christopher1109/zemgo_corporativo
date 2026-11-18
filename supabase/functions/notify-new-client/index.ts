// Manda un correo al equipo cuando un cliente nuevo hace su primer pago.
//
// La llama el trigger trg_notify_new_client (tabla payments) por pg_net, con el
// mismo x-cron-secret que usa send-payment-reminders. También acepta
// { test: true } para el botón "Mandar correo de prueba" de Configuración.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY          API key de https://resend.com
//   NOTIFY_FROM_EMAIL       Remitente, p. ej. "Zemgo <avisos@tudominio.com>"
//                           (el dominio debe estar verificado en Resend; si no se
//                           define se usa onboarding@resend.dev, que solo entrega
//                           al correo dueño de la cuenta de Resend)
//   CORPORATIVO_BASE_URL    (opcional) URL del sistema corporativo para el link al cliente

type Json = Record<string, any>;

const money = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n));

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const METHOD_LABEL: Record<string, string> = {
  card: "Tarjeta", bank_transfer: "Transferencia", bank_reference: "Referencia bancaria",
  cash: "Efectivo", oxxo: "OXXO", manual: "Registro manual",
};

async function rest(supabaseUrl: string, serviceKey: string, path: string): Promise<any> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function buildEmail(d: Json) {
  const rows: [string, string][] = [
    ["Cliente", d.name],
    ["Programa", d.program],
    ["Folio de póliza", d.folio],
    ["Monto pagado", money(d.amount)],
    ["Método", d.method],
    ["Fecha de pago", d.paidAt],
    ["Teléfono", d.phone],
    ["Correo", d.email],
  ];
  const table = rows
    .map(([k, v]) =>
      `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap">${esc(k)}</td>` +
      `<td style="padding:6px 12px;font-size:14px;color:#0f172a">${esc(v || "—")}</td></tr>`)
    .join("");
  const button = d.link
    ? `<p style="margin:20px 0 0"><a href="${esc(d.link)}" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">Ver cliente en el corporativo</a></p>`
    : "";
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
    `${d.test ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:13px">Correo de prueba — los datos son de ejemplo.</p>` : ""}` +
    `<h2 style="margin:0 0 4px;font-size:20px;color:#0f172a">Nuevo cliente en Zemgo</h2>` +
    `<p style="margin:0 0 16px;color:#475569;font-size:14px">Se registró y realizó su primer pago desde el portal.</p>` +
    `<table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:8px">${table}</table>` +
    `${button}</div>`;
  const text = rows.map(([k, v]) => `${k}: ${v || "—"}`).join("\n") + (d.link ? `\n\nVer cliente: ${d.link}` : "");
  return {
    subject: `${d.test ? "[Prueba] " : ""}Nuevo cliente: ${d.name} (${d.program})`,
    html,
    text,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM_EMAIL") ?? "Zemgo <onboarding@resend.dev>";
  const baseUrl = (Deno.env.get("CORPORATIVO_BASE_URL") ?? "").replace(/\/+$/, "");

  const json = (body: Json, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  if (!resendKey) return json({ ok: false, error: "Falta el secreto RESEND_API_KEY" }, 500);

  let body: Json = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }

  try {
    const cfg = await rest(supabaseUrl, serviceKey, "system_config?select=key,value&key=like.notify.new_client.*");
    const emails: string[] = (cfg.find((r: any) => r.key === "notify.new_client.emails")?.value ?? []).filter(Boolean);
    if (!emails.length) return json({ ok: false, error: "No hay correos destinatarios configurados" }, 200);

    let data: Json;
    if (body.test) {
      data = {
        test: true, name: "Cliente de Prueba", program: "FutCare", folio: "FC-000123", amount: 950,
        method: "Tarjeta", paidAt: new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" }),
        phone: "8112345678", email: "cliente@ejemplo.com", link: baseUrl ? `${baseUrl}/clients` : "",
      };
    } else {
      const paymentId = String(body.payment_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return json({ ok: false, error: "payment_id inválido" }, 400);
      const [pay] = await rest(
        supabaseUrl, serviceKey,
        `payments?id=eq.${paymentId}&select=id,amount,paid_amount,paid_at,method,` +
          `policy:policies(folio,program:programs(name,code),client:clients(id,first_name,last_name,phone,payer_phone,email))`,
      );
      if (!pay?.policy?.client) return json({ ok: false, error: "Pago sin cliente" }, 404);
      const c = pay.policy.client;
      data = {
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        program: pay.policy.program?.name ?? pay.policy.program?.code ?? "",
        folio: pay.policy.folio,
        amount: pay.paid_amount ?? pay.amount,
        method: METHOD_LABEL[pay.method] ?? pay.method ?? "",
        paidAt: new Date(pay.paid_at ?? Date.now()).toLocaleString("es-MX", { timeZone: "America/Monterrey" }),
        phone: c.phone || c.payer_phone || "",
        email: c.email || "",
        link: baseUrl ? `${baseUrl}/clients/${c.id}` : "",
      };
    }

    const mail = buildEmail(data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: emails, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    const out = await res.text();
    if (!res.ok) {
      console.error("[notify-new-client] resend error", res.status, out);
      return json({ ok: false, error: "Resend rechazó el envío", detail: out }, 502);
    }
    return json({ ok: true, to: emails });
  } catch (e) {
    console.error("[notify-new-client]", e);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
