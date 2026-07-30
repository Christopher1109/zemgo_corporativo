// WhatsApp Cloud API webhook (Meta)
// Public endpoint — no JWT required.
//
// Responde a mensajes INICIADOS POR EL CLIENTE (ventana de servicio de 24h),
// que NO requieren plantilla aprobada por Meta. Esto es independiente de
// src/lib/whatsapp.ts (StubSender) y de las plantillas automáticas
// (recordatorio de pago vía run_payment_housekeeping), que no se tocan.
//
// Además de responder, guarda cada mensaje (entrante y saliente) en
// public.whatsapp_messages para que el equipo lo pueda revisar desde el
// sistema corporativo.
//
// Control de "pausa" (evita doble respuesta bot + humano): cuando alguien
// del equipo contesta manualmente desde el sistema corporativo
// (whatsapp-send), el bot deja de responder automáticamente a ese número por
// un rato (whatsapp_conversation_state.bot_paused_until). El cliente también
// puede pedir "hablar con una persona" (opción 5) para pausarlo él mismo, y
// puede escribir "menu" en cualquier momento para reactivarlo.

const VERIFY_TOKEN = "ZemgoHope2026_wh_8421";
const GRAPH_VERSION = "v22.0";
const DEFAULT_PHONE_NUMBER_ID = "1158482844021520";
const DEFAULT_PORTAL_URL = "https://www.zemgoportal.com";

// Cuánto tiempo se calla el bot para un número después de que interviene un
// humano, o después de que el cliente pide hablar con alguien.
const HUMAN_PAUSE_HOURS = 12;

function portalUrl(): string {
  return (Deno.env.get("PORTAL_BASE_URL") ?? DEFAULT_PORTAL_URL).replace(/\/+$/, "");
}

function replyForOption(option: string): string | null {
  const base = portalUrl();
  switch (option) {
    case "1":
      return `Para consultar el estado, coberturas o vigencia de tu póliza, entra a tu Portal de Clientes: ${base}/portal. Si no tienes acceso, responde 4.`;
    case "2":
      return `Lamentamos lo sucedido. Para reportar un siniestro, entra al Portal en la sección Incidentes: ${base}/portal/incidents/new`;
    case "3":
      return `Para realizar tu pago, entra a la sección Pagos de tu Portal: ${base}/portal/payments. Ahí puedes generar tu referencia bancaria o pagar con tarjeta.`;
    case "4":
      return `Para entrar al Portal necesitas tu CURP y los últimos 4 dígitos de tu teléfono registrado. Entra aquí: ${base}/portal`;
    default:
      return null;
  }
}

// Normaliza "1", "1️⃣", "opción 1", "1." → "1"
function parseOption(body: string): string | null {
  const cleaned = body.replace(/[\uFE0F\u20E3]/g, "").trim(); // variation selector + keycap
  const m = cleaned.match(/^(?:opci[oó]n\s*)?([1-5])[.\)]?$/i);
  return m ? m[1] : null;
}

// Quita acentos y pasa a minúsculas, para el detector de palabras clave.
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Detección de palabras clave en texto libre ("¿cómo hago mi pago?" → opción 3).
// No es NLU real, es un match de palabras comunes — cubre las formas típicas
// de preguntar sin obligar al cliente a escribir el número exacto.
const KEYWORDS: Record<string, string[]> = {
  "1": ["poliza", "cobertura", "coberturas", "vigencia", "asegurado"],
  "2": ["siniestro", "accidente", "choque", "robo", "reclamo", "dano", "danos"],
  "3": ["pago", "pagar", "pague", "cobro", "abono", "referencia", "deuda", "adeudo", "cuanto debo"],
  "4": ["portal", "acceso", "entrar", "login", "clave", "contrasena", "curp", "olvide"],
  "5": ["persona", "asesor", "humano", "agente", "alguien", "ejecutivo", "hablar con"],
};

function matchKeyword(body: string): string | null {
  const text = normalize(body);
  for (const [option, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return option;
  }
  return null;
}

// Palabra de "reactivar": si el cliente escribe esto, se le vuelve a mostrar
// el menú aunque el bot estuviera en pausa por intervención humana.
function isResumeKeyword(body: string): boolean {
  const text = normalize(body);
  return ["menu", "menú", "opciones", "inicio"].some((w) => text === w);
}

// Extrae la opción elegida cuando el cliente toca un renglón de la lista
// interactiva (en vez de escribir el número a mano).
function optionFromInteractive(msg: any): string | null {
  const id: string | undefined = msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id;
  if (!id) return null;
  const m = id.match(/^opt_([1-5])$/);
  return m ? m[1] : null;
}

function supabaseRest() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

// ---------------------------------------------------------------------------
// Historial de mensajes (public.whatsapp_messages) — vía REST/PostgREST con
// la service role, igual que el resto de las Edge Functions del proyecto.
// ---------------------------------------------------------------------------
async function logMessage(row: {
  wa_phone: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  wa_message_id?: string | null;
  raw_payload?: unknown;
}) {
  const creds = supabaseRest();
  if (!creds) {
    console.error("[whatsapp-webhook] missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — no se guardó el mensaje");
    return;
  }
  try {
    const res = await fetch(`${creds.supabaseUrl}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: {
        apikey: creds.serviceKey,
        authorization: `Bearer ${creds.serviceKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      console.error("[whatsapp-webhook] failed to log message", res.status, await res.text());
    }
  } catch (err) {
    console.error("[whatsapp-webhook] error logging message", err);
  }
}

// ¿Está el bot en pausa para este número? (alguien del equipo ya está
// atendiendo, o el cliente pidió hablar con una persona)
async function isBotPaused(waPhone: string): Promise<boolean> {
  const creds = supabaseRest();
  if (!creds) return false;
  try {
    const res = await fetch(
      `${creds.supabaseUrl}/rest/v1/whatsapp_conversation_state?wa_phone=eq.${encodeURIComponent(waPhone)}&select=bot_paused_until`,
      {
        headers: { apikey: creds.serviceKey, authorization: `Bearer ${creds.serviceKey}` },
      },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    const until = rows?.[0]?.bot_paused_until;
    return !!until && new Date(until).getTime() > Date.now();
  } catch (err) {
    console.error("[whatsapp-webhook] error checking pause state", err);
    return false;
  }
}

async function setBotPause(waPhone: string, hours: number | null) {
  const creds = supabaseRest();
  if (!creds) return;
  const bot_paused_until = hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
  try {
    await fetch(`${creds.supabaseUrl}/rest/v1/whatsapp_conversation_state?on_conflict=wa_phone`, {
      method: "POST",
      headers: {
        apikey: creds.serviceKey,
        authorization: `Bearer ${creds.serviceKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ wa_phone: waPhone, bot_paused_until, updated_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[whatsapp-webhook] error setting pause state", err);
  }
}

async function sendText(to: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? DEFAULT_PHONE_NUMBER_ID;

  if (!token) {
    console.error("[whatsapp-webhook] missing WHATSAPP_ACCESS_TOKEN secret — no se envió respuesta a", to);
    return;
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    console.error("[whatsapp-webhook] send failed", res.status, await res.text());
    return;
  }

  await logMessage({ wa_phone: to, direction: "outbound", message_type: "text", body });
}

// Menú principal como lista interactiva (botón "Ver opciones" + 5 renglones
// tocables), en vez de un mensaje de texto plano con números.
async function sendListMenu(to: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? DEFAULT_PHONE_NUMBER_ID;

  if (!token) {
    console.error("[whatsapp-webhook] missing WHATSAPP_ACCESS_TOKEN secret — no se envió el menú a", to);
    return;
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Zemgo Seguros" },
        body: { text: "Hola 👋, bienvenido a Zemgo Seguros. ¿En qué te podemos ayudar?" },
        footer: { text: "Elige una opción de la lista" },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: [
                { id: "opt_1", title: "Consultar mi póliza", description: "Estado, coberturas y vigencia" },
                { id: "opt_2", title: "Reportar un siniestro", description: "Accidente o incidente" },
                { id: "opt_3", title: "Efectuar pago", description: "Referencia bancaria o tarjeta" },
                { id: "opt_4", title: "Acceso al Portal", description: "Entrar con CURP y teléfono" },
                { id: "opt_5", title: "Hablar con una persona", description: "Un asesor te va a contactar" },
              ],
            },
          ],
        },
      },
    }),
  });

  if (!res.ok) {
    console.error("[whatsapp-webhook] send list menu failed", res.status, await res.text());
    return;
  }

  await logMessage({ wa_phone: to, direction: "outbound", message_type: "interactive", body: "[Menú principal]" });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      console.log("[whatsapp-webhook] verification OK");
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }

    console.warn("[whatsapp-webhook] verification FAILED", { mode, tokenMatches: token === VERIFY_TOKEN });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      const payload = await req.json();
      console.log("[whatsapp-webhook] incoming event:", JSON.stringify(payload));

      const entries = Array.isArray(payload?.entry) ? payload.entry : [];
      for (const entry of entries) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value ?? {};
          const messages = Array.isArray(value.messages) ? value.messages : [];

          for (const msg of messages) {
            const from: string | undefined = msg?.from;
            if (!from) continue;

            let option: string | null = null;
            let inboundBody: string | null = null;

            if (msg?.type === "interactive") {
              option = optionFromInteractive(msg);
              inboundBody =
                msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title ?? `[interactivo:${option ?? "?"}]`;
            } else if (msg?.type === "text") {
              const body: string = String(msg?.text?.body ?? "");
              inboundBody = body;
              option = parseOption(body) ?? matchKeyword(body);
            } else {
              inboundBody = `[${msg?.type ?? "mensaje"}]`;
            }

            await logMessage({
              wa_phone: from,
              direction: "inbound",
              message_type: String(msg?.type ?? "text"),
              body: inboundBody,
              wa_message_id: msg?.id ?? null,
              raw_payload: msg,
            });

            // Opción 5: el cliente pide hablar con una persona → se pausa el
            // bot y se avisa, sin mandar el menú de nuevo.
            if (option === "5") {
              await setBotPause(from, HUMAN_PAUSE_HOURS);
              await sendText(
                from,
                "Perfecto, un asesor de Zemgo te va a contactar en breve por este mismo chat. Si necesitas el menú de opciones de nuevo, escribe *menu*.",
              );
              continue;
            }

            // Si el cliente escribe explícitamente "menu", se reactiva el
            // bot aunque estuviera en pausa por intervención humana.
            const resumeRequested = msg?.type === "text" && isResumeKeyword(String(msg?.text?.body ?? ""));
            if (resumeRequested) {
              await setBotPause(from, null);
              await sendListMenu(from);
              continue;
            }

            // Si ya interviene una persona (o el cliente pidió hablar con
            // alguien), el bot se queda callado para no contestar por
            // encima — el equipo lo atiende desde el sistema corporativo.
            if (await isBotPaused(from)) {
              console.log("[whatsapp-webhook] bot en pausa, no se responde →", from);
              continue;
            }

            const optionReply = option ? replyForOption(option) : null;

            if (optionReply) {
              await sendText(from, optionReply);
              continue;
            }

            // Texto libre sin coincidencia / opción inválida → menú principal.
            console.log("[whatsapp-webhook] menú →", from);
            await sendListMenu(from);
          }
        }
      }
    } catch (err) {
      console.error("[whatsapp-webhook] failed to handle event", err);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
