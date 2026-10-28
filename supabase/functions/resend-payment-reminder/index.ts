// Envío MANUAL del recordatorio de pago, disparado por un clic de una persona
// del equipo desde el panel administrativo (Alertas o perfil del cliente).
// Protegida con JWT de Supabase (verify_jwt=true).
//
// Regla (oct 2026): los recordatorios son solo para clientes con cobertura
// (póliza active o suspended). El cobro de activación de un prospecto no es un recordatorio.
//
// Plantillas por programa (oct 2026, aprobadas por Meta, idioma es_MX):
//   ABC     -> recordatorio_pago_abc      {{1}} nombre {{2}} monto {{3}} fecha DD/MM/YYYY
//   FUTCARE -> recordatorio_pago_futcare  {{1}} nombre {{2}} fecha DD/MM/YYYY {{3}} monto
//   Otros (MCV) -> payment_reminder (plantilla anterior, 6 variables).
//
// Errores: siempre responde JSON { ok:false, error:<codigo>, message:<texto para el usuario> }.

const GRAPH_VERSION = "v22.0";
const TEMPLATE_LANG = "es_MX";
const LEGACY_TEMPLATE = "payment_reminder";
const DEFAULT_COUNTRY_CODE = "52";
const PORTAL_LINK = "https://www.zemgoportal.com/portal/payments";

const TOKEN_ENV_BY_PROGRAM: Record<string, string> = {
  FUTCARE: "WHATSAPP_ACCESS_TOKEN_FUTCARE",
};

const PERIOD_LABEL_BY_PROGRAM: Record<string, string> = {
  ABC: "mensual",
  FUTCARE: "anual",
  MCV: "anual",
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}
function fail(error: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error, message, ...extra }, status);
}

function getAccessToken(programCode: string | null): string | undefined {
  const envName = (programCode && TOKEN_ENV_BY_PROGRAM[programCode]) || "WHATSAPP_ACCESS_TOKEN";
  return Deno.env.get(envName) ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN");
}

function toE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
  return digits;
}

function montoSimple(amount: number): string {
  return amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function montoLegacy(amount: number, programCode: string | null): string {
  const period = (programCode && PERIOD_LABEL_BY_PROGRAM[programCode]) || "";
  return `$${montoSimple(amount)} MXN${period ? " " + period : ""}`;
}

// "2026-11-23" -> "23/11/2026"
function fechaCorta(iso: string): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

function fechaLarga(iso: string): string {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function buildTemplate(programCode: string | null, name: string, program: string, amount: number, dueDate: string) {
  if (programCode === "ABC") {
    return { name: "recordatorio_pago_abc", params: [name, montoSimple(amount), fechaCorta(dueDate)] };
  }
  if (programCode === "FUTCARE") {
    return { name: "recordatorio_pago_futcare", params: [name, fechaCorta(dueDate), montoSimple(amount)] };
  }
  return {
    name: LEGACY_TEMPLATE,
    params: [name, program, program, montoLegacy(amount, programCode), fechaLarga(dueDate), PORTAL_LINK],
  };
}

function getUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice("Bearer ".length);
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("metodo_no_permitido", "Método no permitido.", 405);

  const userId = getUserIdFromJwt(req.headers.get("authorization"));
  if (!userId) return fail("no_autorizado", "Tu sesión expiró. Vuelve a iniciar sesión.", 401);

  let paymentId: string;
  try {
    const data = await req.json();
    paymentId = String(data?.payment_id ?? "");
  } catch {
    return fail("payload_invalido", "Solicitud inválida.");
  }
  if (!paymentId) return fail("falta_payment_id", "Falta indicar el pago.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/payments?id=eq.${encodeURIComponent(paymentId)}&select=id,amount,due_date,status,policy_id,policies(status,client_id,program_id,company_id,programs(code,name),clients(first_name,phone,payer_phone))`,
    { headers },
  );
  const rows = res.ok ? await res.json() : [];
  const row = rows?.[0];
  if (!row) return fail("pago_no_encontrado", "No se encontró el pago.", 404);

  if (!["pending", "overdue"].includes(row.status)) {
    return fail("pago_no_pendiente", "Este pago ya no está pendiente, no se manda recordatorio.");
  }
  if (row?.policies?.company_id) {
    return fail("pago_de_empresa", "Este certificado se cobra a la empresa; no lleva recordatorio individual.");
  }
  if (!["active", "suspended"].includes(row?.policies?.status)) {
    return fail("cliente_no_activo", "Este cliente aún no ha pagado su activación; no se manda recordatorio.");
  }

  const programCode: string = row?.policies?.programs?.code;
  const client = row?.policies?.clients ?? {};
  const phone: string | null = (client.phone && String(client.phone).trim()) || (client.payer_phone && String(client.payer_phone).trim()) || null;
  const firstName: string = client.first_name ?? "";
  const programName: string = row?.policies?.programs?.name ?? "";

  if (!phone) {
    return fail("cliente_sin_telefono", "El cliente no tiene teléfono registrado. Agrégalo en su perfil y vuelve a intentar.");
  }
  const to = toE164(phone);
  if (to.length < 12) {
    return fail("telefono_invalido", `El teléfono registrado (${phone}) no parece válido. Revísalo en el perfil del cliente.`);
  }

  const lineRes = await fetch(
    `${supabaseUrl}/rest/v1/whatsapp_lines?program_code=eq.${encodeURIComponent(programCode)}&select=phone_number_id`,
    { headers },
  );
  const lineRows = await lineRes.json();
  const phoneNumberId: string | undefined = lineRows?.[0]?.phone_number_id;
  if (!phoneNumberId) return fail("sin_linea", `No hay línea de WhatsApp configurada para ${programCode}.`);

  const token = getAccessToken(programCode);
  if (!token) return fail("sin_token", `Falta el token de WhatsApp para ${programCode}.`, 500);

  const amount = typeof row.amount === "string" ? parseFloat(row.amount) : row.amount;
  const tpl = buildTemplate(programCode, firstName, programName, amount, row.due_date);

  const sendRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: tpl.name,
        language: { code: TEMPLATE_LANG },
        components: [{ type: "body", parameters: tpl.params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });

  const ok = sendRes.ok;
  const respText = await sendRes.text();

  await fetch(`${supabaseUrl}/rest/v1/notifications`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      channel: "whatsapp",
      recipient: phone,
      template_code: "PAYMENT_REMINDER_WHATSAPP",
      status: ok ? "sent" : "failed",
      sent_at: ok ? new Date().toISOString() : null,
      payload: {
        payment_id: paymentId,
        policy_id: row.policy_id,
        program_id: row.policies?.program_id,
        client_id: row.policies?.client_id,
        manual: true,
        sent_by: userId,
        to: phone,
        template: tpl.name,
        var1_first_name: firstName,
        var2_program: programName,
        var3_amount: String(amount),
        var4_due_date: fechaCorta(row.due_date),
        var5_portal_link: PORTAL_LINK,
      },
    }),
  });

  if (!ok) {
    console.error("[resend-payment-reminder] send failed", tpl.name, sendRes.status, respText);
    return fail("envio_fallido", "WhatsApp rechazó el envío (número sin WhatsApp o error de la línea).", 502, { detail: respText });
  }

  return json({ ok: true, to: phone });
});
