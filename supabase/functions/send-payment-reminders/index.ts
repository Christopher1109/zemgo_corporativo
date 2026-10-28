// Envía por WhatsApp los recordatorios de pago encolados por
// run_payment_housekeeping (channel='whatsapp', template_code='PAYMENT_REMINDER_WHATSAPP').
// Se invoca por cron. Protegido con el header x-cron-secret (secret CRON_SECRET).
//
// Plantillas por programa (oct 2026, aprobadas por Meta, idioma es_MX):
//   ABC     -> recordatorio_pago_abc      (cuenta ABC de Protección)
//              {{1}} nombre  {{2}} monto ("199")        {{3}} fecha ("23/11/2026")
//   FUTCARE -> recordatorio_pago_futcare  (cuenta Fut-care)
//              {{1}} nombre  {{2}} fecha ("23/11/2026") {{3}} monto ("800")
//   Otros (MCV) -> payment_reminder (plantilla anterior, 6 variables).
// El "$" y el link del portal ya vienen fijos en el texto de las plantillas nuevas.
// Los datos base se siguen guardando igual en notifications.payload (var1..var5).

const GRAPH_VERSION = "v22.0";
const TEMPLATE_LANG = "es_MX";
const LEGACY_TEMPLATE = "payment_reminder";
const DEFAULT_COUNTRY_CODE = "52";

const TOKEN_ENV_BY_PROGRAM: Record<string, string> = {
  FUTCARE: "WHATSAPP_ACCESS_TOKEN_FUTCARE",
};

const PERIOD_LABEL_BY_PROGRAM: Record<string, string> = {
  ABC: "mensual",
  FUTCARE: "anual",
  MCV: "anual",
};

function getAccessToken(programCode: string | null): string | undefined {
  const envName = (programCode && TOKEN_ENV_BY_PROGRAM[programCode]) || "WHATSAPP_ACCESS_TOKEN";
  return Deno.env.get(envName) ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN");
}

function toE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
  return digits;
}

// Acepta "YYYY-MM-DD" o "DD/MM/YYYY" y regresa [dd, mm, yyyy].
function dateParts(raw: string): [string, string, string] | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return [iso[3], iso[2], iso[1]];
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return [dmy[1], dmy[2], dmy[3]];
  return null;
}

function fechaCorta(raw: string): string {
  const p = dateParts(raw);
  return p ? `${p[0]}/${p[1]}/${p[2]}` : raw;
}

function fechaLarga(raw: string): string {
  const p = dateParts(raw);
  if (!p) return raw;
  const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

// "199", "1,250", "199.5" (sin "$": ya viene en la plantilla).
function montoSimple(rawAmount: string): string {
  const n = parseFloat(rawAmount);
  return isNaN(n) ? rawAmount : n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function montoLegacy(rawAmount: string, programCode: string | null): string {
  const period = (programCode && PERIOD_LABEL_BY_PROGRAM[programCode]) || "";
  return `$${montoSimple(rawAmount)} MXN${period ? " " + period : ""}`;
}

type ReminderData = { name: string; program: string; amount: string; dueDate: string; link: string };

function buildTemplate(programCode: string | null, d: ReminderData): { name: string; params: string[] } {
  if (programCode === "ABC") {
    return { name: "recordatorio_pago_abc", params: [d.name, montoSimple(d.amount), fechaCorta(d.dueDate)] };
  }
  if (programCode === "FUTCARE") {
    return { name: "recordatorio_pago_futcare", params: [d.name, fechaCorta(d.dueDate), montoSimple(d.amount)] };
  }
  return {
    name: LEGACY_TEMPLATE,
    params: [d.name, d.program, d.program, montoLegacy(d.amount, programCode), fechaLarga(d.dueDate), d.link],
  };
}

type ProgramRow = { id: string; code: string };
type LineRow = { program_code: string; phone_number_id: string | null };

async function buildProgramMaps(
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ phoneNumberIdByProgramId: Record<string, string>; codeByProgramId: Record<string, string> }> {
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };

  const [programsRes, linesRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/programs?select=id,code`, { headers }),
    fetch(`${supabaseUrl}/rest/v1/whatsapp_lines?select=program_code,phone_number_id`, { headers }),
  ]);

  if (!programsRes.ok || !linesRes.ok) {
    console.error(
      "[send-payment-reminders] failed to load programs/whatsapp_lines",
      programsRes.ok ? "" : await programsRes.text(),
      linesRes.ok ? "" : await linesRes.text(),
    );
    return { phoneNumberIdByProgramId: {}, codeByProgramId: {} };
  }

  const programs: ProgramRow[] = await programsRes.json();
  const lines: LineRow[] = await linesRes.json();
  const codeToPhoneNumberId = new Map(
    lines.filter((l) => !!l.phone_number_id).map((l) => [l.program_code, l.phone_number_id as string]),
  );

  const phoneNumberIdByProgramId: Record<string, string> = {};
  const codeByProgramId: Record<string, string> = {};
  for (const p of programs) {
    codeByProgramId[p.id] = p.code;
    const phoneNumberId = codeToPhoneNumberId.get(p.code);
    if (phoneNumberId) phoneNumberIdByProgramId[p.id] = phoneNumberId;
  }
  return { phoneNumberIdByProgramId, codeByProgramId };
}

async function isWhatsappEnabled(supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/system_config?key=eq.integration.whatsapp.enabled&select=value`,
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return rows?.[0]?.value === true;
  } catch (err) {
    console.error("[send-payment-reminders] error checking integration.whatsapp.enabled", err);
    return false;
  }
}

function templateFromPayload(p: Record<string, unknown>, programCode: string | null) {
  return buildTemplate(programCode, {
    name: String(p.var1_first_name ?? ""),
    program: String(p.var2_program ?? ""),
    amount: String(p.var3_amount ?? ""),
    dueDate: String(p.var4_due_date ?? ""),
    link: String(p.var5_portal_link ?? ""),
  });
}

async function sendTemplate(phoneNumberId: string, token: string, to: string, tpl: { name: string; params: string[] }) {
  return await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
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
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body?.test_send) {
    const { to: rawTo, program_code } = body.test_send;
    if (!rawTo || !program_code) {
      return new Response(JSON.stringify({ error: "test_send requiere 'to' y 'program_code'" }), { status: 400 });
    }
    const { phoneNumberIdByProgramId, codeByProgramId } = await buildProgramMaps(supabaseUrl, serviceKey);
    const phoneNumberIdByCode: Record<string, string> = {};
    for (const [pid, code] of Object.entries(codeByProgramId)) {
      if (phoneNumberIdByProgramId[pid]) phoneNumberIdByCode[code] = phoneNumberIdByProgramId[pid];
    }
    const phoneNumberId = phoneNumberIdByCode[program_code];
    if (!phoneNumberId) {
      return new Response(JSON.stringify({ error: `sin phone_number_id para program_code=${program_code}` }), { status: 400 });
    }
    const token = getAccessToken(program_code);
    if (!token) {
      return new Response(JSON.stringify({ error: `sin access token para program_code=${program_code}` }), { status: 500 });
    }
    const to = toE164(String(rawTo));
    const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const tpl = buildTemplate(program_code, {
      name: "Prueba",
      program: program_code,
      amount: "100",
      dueDate: due,
      link: "https://www.zemgoportal.com/portal/payments",
    });
    const sendRes = await sendTemplate(phoneNumberId, token, to, tpl);
    const responseText = await sendRes.text();
    return new Response(
      JSON.stringify({ mode: "test_send", ok: sendRes.ok, status: sendRes.status, template: tpl.name, meta_response: responseText, sent_to: to, phone_number_id: phoneNumberId }),
      { status: sendRes.ok ? 200 : 502, headers: { "content-type": "application/json" } },
    );
  }

  const enabled = await isWhatsappEnabled(supabaseUrl, serviceKey);
  if (!enabled) {
    console.log("[send-payment-reminders] integration.whatsapp.enabled=false, no se procesa la cola");
    return new Response(JSON.stringify({ skipped: true, reason: "integration.whatsapp.enabled=false" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { phoneNumberIdByProgramId, codeByProgramId } = await buildProgramMaps(supabaseUrl, serviceKey);

  const listRes = await fetch(
    `${supabaseUrl}/rest/v1/notifications?channel=eq.whatsapp&template_code=eq.PAYMENT_REMINDER_WHATSAPP&status=eq.pending&select=id,recipient,payload`,
    { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
  );

  if (!listRes.ok) {
    console.error("[send-payment-reminders] failed to list notifications", await listRes.text());
    return new Response(JSON.stringify({ error: "list_failed" }), { status: 500 });
  }

  const rows: Array<{ id: string; recipient: string; payload: Record<string, string> }> = await listRes.json();

  let sent = 0;
  let failed = 0;
  let skippedNoLine = 0;
  let skippedNoToken = 0;

  for (const row of rows) {
    const p = row.payload ?? {};

    const programId = String(p.program_id ?? "");
    const phoneNumberId = phoneNumberIdByProgramId[programId];
    if (!phoneNumberId) {
      skippedNoLine++;
      console.warn("[send-payment-reminders] sin línea de WhatsApp configurada para program_id, se deja pendiente", row.id, programId);
      continue;
    }

    const programCode = codeByProgramId[programId] ?? null;
    const token = getAccessToken(programCode);
    if (!token) {
      skippedNoToken++;
      console.error("[send-payment-reminders] sin access token configurado para el programa, se deja pendiente", row.id, programCode);
      continue;
    }

    const rawTo = String(p.to ?? row.recipient ?? "");
    const to = toE164(rawTo);
    if (!to || to.length < 12) {
      failed++;
      console.error("[send-payment-reminders] invalid phone, skipped", row.id, rawTo);
      continue;
    }

    const tpl = templateFromPayload(p, programCode);
    const sendRes = await sendTemplate(phoneNumberId, token, to, tpl);

    const newStatus = sendRes.ok ? "sent" : "failed";
    if (sendRes.ok) {
      sent++;
    } else {
      failed++;
      console.error("[send-payment-reminders] send failed", row.id, tpl.name, phoneNumberId, sendRes.status, await sendRes.text());
    }

    await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${row.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: newStatus,
        sent_at: sendRes.ok ? new Date().toISOString() : null,
        payload: { ...p, template: tpl.name },
      }),
    });
  }

  return new Response(
    JSON.stringify({ processed: rows.length, sent, failed, skipped_no_line: skippedNoLine, skipped_no_token: skippedNoToken }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
