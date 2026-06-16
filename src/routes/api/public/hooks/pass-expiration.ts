import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/pass-expiration")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_pass_expiration_check");
        if (error) {
          console.error("pass-expiration error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("pass-expiration endpoint — POST only", { status: 200 }),
    },
  },
});
