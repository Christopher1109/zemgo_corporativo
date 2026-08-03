import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Tier lookup helper */
function pickTier(tiers: any[], clientCount: number, programId: string | null) {
  const filtered = tiers.filter(
    (t) => t.program_id === programId || t.program_id === null,
  );
  // Program-specific tier wins over global
  const sorted = filtered.sort(
    (a, b) => (a.program_id ? 0 : 1) - (b.program_id ? 0 : 1),
  );
  return (
    sorted.find(
      (t) =>
        clientCount >= (t.min_clients ?? 0) &&
        (t.max_clients == null || clientCount <= t.max_clients),
    ) ?? null
  );
}

/** List all sales reps with their aggregate stats. */
export const listSalesReps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ program_id: z.string().uuid().nullable().optional() })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const programId = data?.program_id ?? null;

    const repsQ = await sb
      .from("sales_reps")
      .select("id, full_name, referral_source, code, commission_rate, is_active")
      .order("full_name");
    if (repsQ.error) throw new Error(repsQ.error.message);
    const reps = repsQ.data ?? [];

    // Aggregate: count active policies + premium per rep
    let polQ = sb
      .from("policies")
      .select("sales_rep_id, premium, status, program_id, client_id")
      .not("sales_rep_id", "is", null);
    if (programId) polQ = polQ.eq("program_id", programId);
    const pol = await polQ;
    if (pol.error) throw new Error(pol.error.message);

    const tiersQ = await sb
      .from("commission_tiers")
      .select("id, program_id, min_clients, max_clients, percentage, label");
    if (tiersQ.error) throw new Error(tiersQ.error.message);
    const tiers = tiersQ.data ?? [];

    const stats = new Map<
      string,
      { active: number; total: number; premium: number; clients: Set<string> }
    >();
    for (const p of pol.data ?? []) {
      const rid = p.sales_rep_id as string;
      const s = stats.get(rid) ?? {
        active: 0,
        total: 0,
        premium: 0,
        clients: new Set<string>(),
      };
      s.total += 1;
      if (p.status === "active") s.active += 1;
      s.premium += Number(p.premium ?? 0);
      if (p.client_id) s.clients.add(p.client_id as string);
      stats.set(rid, s);
    }

    return reps.map((r) => {
      const s = stats.get(r.id) ?? {
        active: 0,
        total: 0,
        premium: 0,
        clients: new Set<string>(),
      };
      const clientCount = s.clients.size;
      const tier = pickTier(tiers, clientCount, programId);
      const rate = Number(tier?.percentage ?? r.commission_rate ?? 0);
      const commission = (s.premium * rate) / 100;
      // Next tier (min_clients > current)
      const upcoming = tiers
        .filter(
          (t) =>
            (t.program_id === programId || t.program_id === null) &&
            (t.min_clients ?? 0) > clientCount,
        )
        .sort((a, b) => (a.min_clients ?? 0) - (b.min_clients ?? 0))[0];
      return {
        ...r,
        active_policies: s.active,
        total_policies: s.total,
        clients: clientCount,
        premium_total: s.premium,
        commission_rate: rate,
        commission_amount: commission,
        tier_label: tier?.label ?? null,
        next_tier: upcoming
          ? {
              label: upcoming.label,
              percentage: Number(upcoming.percentage),
              missing: (upcoming.min_clients ?? 0) - clientCount,
            }
          : null,
      };
    });
  });

/** Detailed portfolio for one sales rep */
export const getSalesRepDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sales_rep_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const repQ = await sb
      .from("sales_reps")
      .select("id, full_name, referral_source, code, commission_rate, is_active, metadata")
      .eq("id", data.sales_rep_id)
      .maybeSingle();
    if (repQ.error) throw new Error(repQ.error.message);
    if (!repQ.data) throw new Error("Vendedor no encontrado");

    const polQ = await sb
      .from("policies")
      .select(
        "id, folio, status, premium, start_date, end_date, program_id, programs(code, name, color_primary), clients(id, first_name, last_name, email, phone, state)",
      )
      .eq("sales_rep_id", data.sales_rep_id)
      .order("start_date", { ascending: false });
    if (polQ.error) throw new Error(polQ.error.message);

    const tiersQ = await sb
      .from("commission_tiers")
      .select("id, program_id, min_clients, max_clients, percentage, label");
    if (tiersQ.error) throw new Error(tiersQ.error.message);

    return {
      rep: repQ.data,
      policies: polQ.data ?? [],
      tiers: tiersQ.data ?? [],
    };
  });

/** List commission tiers */
export const listCommissionTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const q = await context.supabase
      .from("commission_tiers")
      .select("id, program_id, min_clients, max_clients, percentage, label, programs(code, name)")
      .order("program_id", { ascending: true, nullsFirst: true })
      .order("min_clients");
    if (q.error) throw new Error(q.error.message);
    return q.data ?? [];
  });

/** Upsert one tier (super admin only) */
export const upsertCommissionTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        program_id: z.string().uuid().nullable().optional(),
        min_clients: z.number().int().min(0),
        max_clients: z.number().int().min(0).nullable().optional(),
        percentage: z.number().min(0).max(100),
        label: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const isAdmin = await sb.rpc("is_super_admin", { _user_id: context.userId });
    if (!isAdmin.data) throw new Error("Solo super administradores");
    const payload = {
      program_id: data.program_id ?? null,
      min_clients: data.min_clients,
      max_clients: data.max_clients ?? null,
      percentage: data.percentage,
      label: data.label ?? null,
    };
    if (data.id) {
      const u = await sb.from("commission_tiers").update(payload).eq("id", data.id).select().maybeSingle();
      if (u.error) throw new Error(u.error.message);
      return u.data;
    }
    const i = await sb.from("commission_tiers").insert(payload).select().maybeSingle();
    if (i.error) throw new Error(i.error.message);
    return i.data;
  });

export const deleteCommissionTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase.rpc("is_super_admin", { _user_id: context.userId });
    if (!isAdmin.data) throw new Error("Solo super administradores");
    const d = await context.supabase.from("commission_tiers").delete().eq("id", data.id);
    if (d.error) throw new Error(d.error.message);
    return { ok: true };
  });

/** Search policies (certificates) to link/unlink to a sales rep */
export const searchAssignablePolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().optional(),
        program_id: z.string().uuid().nullable().optional(),
        only_unassigned: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("policies")
      .select(
        "id, folio, status, premium, sales_rep_id, program_id, programs(code, color_primary), clients(id, first_name, last_name, curp)",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (data.program_id) q = q.eq("program_id", data.program_id);
    if (data.only_unassigned) q = q.is("sales_rep_id", null);
    if (data.search && data.search.trim().length >= 2) {
      q = q.ilike("folio", `%${data.search.trim()}%`);
    }
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  });

/** Link or unlink a certificate to a sales rep. Also syncs the client's rep. */
export const setPolicySalesRep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        policy_id: z.string().uuid(),
        sales_rep_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const u = await sb
      .from("policies")
      .update({ sales_rep_id: data.sales_rep_id })
      .eq("id", data.policy_id)
      .select("id, client_id")
      .maybeSingle();
    if (u.error) throw new Error(u.error.message);
    if (!u.data) throw new Error("No se pudo actualizar el certificado (permisos)");
    if (u.data.client_id) {
      await sb
        .from("clients")
        .update({ sales_rep_id: data.sales_rep_id })
        .eq("id", u.data.client_id);
    }
    return { ok: true };
  });

/** Delete a sales rep and unlink all their history (admins only). */
export const deleteSalesRep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sales_rep_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("delete_sales_rep", {
      _sales_rep_id: data.sales_rep_id,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data as any;
  });
