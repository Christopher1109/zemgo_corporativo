// Demo seed for the kickoff demo. Tagged with metadata.is_demo=true so it
// can be wiped without touching real records. Only super admins may call.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SEED_TABLES = [
  "medical_passes", "incidents", "payments", "payment_schedules",
  "beneficiaries", "dependents", "policies", "client_programs",
  "clients", "sales_reps", "renewal_contacts",
] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const getSeedDemoCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: _admin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = _admin as any;
    const out: Record<string, number> = {};
    for (const t of SEED_TABLES) {
      const { count } = await supabaseAdmin
        .from(t)
        .select("id", { count: "exact", head: true })
        .eq("metadata->>is_demo", "true");
      out[t] = count ?? 0;
    }
    return out;
  });

export const clearSeedDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: _admin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = _admin as any;
    const deleted: Record<string, number> = {};
    for (const t of SEED_TABLES) {
      const { data, error } = await supabaseAdmin
        .from(t).delete().eq("metadata->>is_demo", "true").select("id");
      if (error) throw new Error(`${t}: ${error.message}`);
      deleted[t] = data?.length ?? 0;
    }
    return { ok: true, deleted };
  });

export const runSeedDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: _admin } = await import("@/integrations/supabase/client.server");
    const { runDemoSeed } = await import("./seed-core.server");
    return runDemoSeed(_admin as any, context.userId);
  });
