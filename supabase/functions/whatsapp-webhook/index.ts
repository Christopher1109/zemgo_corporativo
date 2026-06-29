// WhatsApp Cloud API webhook (Meta)
// Public endpoint — no JWT required.

const VERIFY_TOKEN = "ZemgoHope2026_wh_8421";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      console.log("[whatsapp-webhook] verification OK");
      return new Response(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    console.warn("[whatsapp-webhook] verification FAILED", { mode, tokenMatches: token === VERIFY_TOKEN });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      const payload = await req.json();
      console.log("[whatsapp-webhook] incoming event:", JSON.stringify(payload));

      // TODO (siguiente fase): procesar entry[].changes[].value.messages y .statuses
      // const entries = Array.isArray(payload?.entry) ? payload.entry : [];
      // for (const entry of entries) {
      //   for (const change of entry?.changes ?? []) {
      //     const value = change?.value ?? {};
      //     const messages = value.messages ?? []; // mensajes entrantes
      //     const statuses = value.statuses ?? []; // estados de entrega
      //   }
      // }
    } catch (err) {
      console.error("[whatsapp-webhook] failed to parse body", err);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
