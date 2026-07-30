// Envía un mensaje de WhatsApp manual desde el sistema corporativo (un
// miembro del equipo contestando una conversación desde la pantalla de
// Mensajes) y lo guarda en public.whatsapp_messages.
//
// Protegida con JWT de Supabase (verify_jwt = true en config.toml): solo
// personal con sesión iniciada puede invocarla. Reutiliza el mismo secreto
// WHATSAPP_ACCESS_TOKEN que ya usa whatsapp-webhook para el bot automático.
//
// Solo se puede mandar texto libre dentro de la ventana de servicio de 24h
// que abre el cliente al escribir — igual que hace Meta con cualquier
// integración de Cloud API. Si la ventana está cerrada, Meta rechaza el
// envío (error 131047 / "message failed to send because more than 24
// hours have passed since the customer last replied to this number").

const GRAPH_VERSION = "v22.0";
const DEFAULT_PHONE_NUMBER_ID = "1158482844021520";

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
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const userId = getUserIdFromJwt(req.headers.get("authorization"));
  if (!userId) {
    return new Response(JSON.stringify({ error: "no_autorizado" }), { status: 401 });
  }

  let to: string;
  let body: string;
  try {
    const data = await req.json();
    to = String(data?.to ?? "").replace(/[^\d]/g, "");
    body = String(data?.body ?? "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "payload_invalido" }), { status: 400 });
  }
  if (!to || !body) {
    return new Response(JSON.stringify({ error: "faltan_datos" }), { status: 400 });
  }

  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? DEFAULT_PHONE_NUMBER_ID;
  if (!token) {
    return new Response(JSON.stringify({ error: "whatsapp_no_configurado" }), { status: 500 });
  }

  const sendRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
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

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error("[whatsapp-send] send failed", sendRes.status, errText);
    return new Response(JSON.stringify({ error: "envio_fallido", detail: errText }), { status: 502 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          wa_phone: to,
          direction: "outbound",
          message_type: "text",
          body,
          sent_by: userId,
        }),
      });

      // Un humano ya está atendiendo esta conversación — el bot se calla
      // por un rato para no contestar encima de la persona, y se limpia
      // la bandera de "necesita atención" (ya se está atendiendo).
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversation_state?on_conflict=wa_phone`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          wa_phone: to,
          bot_paused_until: new Date(Date.now() + 2 * 3600_000).toISOString(),
          needs_human: false,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error("[whatsapp-send] error logging message", err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
