// One-shot setup endpoint:
//  - Creates the `admin` user (admin@hope.local) with a random password,
//    grants `admin` role on every program in user_program_access.
//  - Seeds demo data so the platform is populated for screenshots/demo.
//  - Guarded: requires SETUP_BOOTSTRAP_TOKEN env + idempotent (only seeds once).
//
// Usage: POST /api/public/bootstrap with header `x-bootstrap-token: <token>`
// Response: { username, password, stats } the first time; { exists: true } after.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SETUP_BOOTSTRAP_TOKEN;
        if (!expected) {
          return Response.json({ ok: false, error: "SETUP_BOOTSTRAP_TOKEN not set" }, { status: 500 });
        }
        const token = request.headers.get("x-bootstrap-token") ?? "";
        if (token !== expected) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin: _admin } = await import("@/integrations/supabase/client.server");
        const supabaseAdmin = _admin as any;

        const ADMIN_EMAIL = "admin@hope.local";

        // Idempotency: does the admin user already exist?
        const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = existingList?.users?.find((u: any) => u.email === ADMIN_EMAIL);

        let userId: string;
        let password: string | null = null;

        if (existing) {
          userId = existing.id;
        } else {
          // Generate a strong random password.
          const bytes = new Uint8Array(12);
          crypto.getRandomValues(bytes);
          password = Array.from(bytes, (b) => b.toString(36)).join("").slice(0, 14) + "!A1";

          const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password,
            email_confirm: true,
            user_metadata: { full_name: "Administrador General", username: "admin" },
          });
          if (cErr || !created?.user) {
            return Response.json({ ok: false, error: cErr?.message ?? "createUser failed" }, { status: 500 });
          }
          userId = created.user.id;

          // Ensure a profiles row exists.
          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            full_name: "Administrador General",
          }, { onConflict: "id" });
        }

        // Grant admin role on every program (idempotent).
        const { data: programs } = await supabaseAdmin.from("programs").select("id");
        if (programs?.length) {
          const rows = programs.map((p: any) => ({
            user_id: userId, program_id: p.id, role: "admin",
          }));
          await supabaseAdmin.from("user_program_access")
            .upsert(rows, { onConflict: "user_id,program_id" });
        }

        // Seed demo data (idempotent — runDemoSeed clears prior demo rows first).
        const { runDemoSeed } = await import("@/lib/seed-core.server");
        let seedResult: any = null;
        let seedError: string | null = null;
        try {
          seedResult = await runDemoSeed(supabaseAdmin, userId);
        } catch (e: any) {
          seedError = String(e?.message ?? e);
        }

        return Response.json({
          ok: true,
          username: "admin",
          email: ADMIN_EMAIL,
          password,
          already_existed: !!existing,
          seed: seedResult,
          seed_error: seedError,
        });
      },
    },
  },
});
