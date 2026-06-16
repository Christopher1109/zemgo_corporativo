import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/payment-housekeeping")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_payment_housekeeping");
        if (error) {
          console.error("housekeeping error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("payment-housekeeping endpoint — POST only", { status: 200 }),
    },
  },
});
