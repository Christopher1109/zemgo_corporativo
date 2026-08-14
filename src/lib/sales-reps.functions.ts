import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const COMMISSION_NEW = 20;
const COMMISSION_RENEWAL = 10;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** List all sales reps with commission-based stats. */
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
      .select("id, full_name, referral_source, code, is_active")
      .order("full_name");
    if (repsQ.error) throw new Error(repsQ.error.message);
    const reps = repsQ.data ?? [];

    let polQ = sb
      .from("policies")
      .select("sales_rep_id, premium, status, program_id, client_id")
      .not("sales_rep_id", "is", null);
    if (programId) polQ = polQ.eq("program_id", programId);
    const pol = await polQ;
    if (pol.error) throw new Error(pol.error.message);

    let comQ = sb
      .from("sales_commissions")
      .select("sales_rep_id, kind, amount, base_amount, period, program_id");
    if (programId) comQ = comQ.eq("program_id", programId);
    const com = await comQ;
    if (com.error) throw new Error(com.error.message);

    const thisMonth = monthKey(new Date());
    const thisYear = String(new Date().getFullYear());

    const stats = new Map<
      string,
      { active: number; total: number; premium: number; clients: Set<string> }
    >();
    for (const p of pol.data ?? []) {
      const rid = p.sales_rep_id as string;
      const s = stats.get(rid) ?? { active: 0, total: 0, premium: 0, clients: new Set<string>() };
      s.total += 1;
      if (p.status === "active") s.active += 1;
      s.premium += Number(p.premium ?? 0);
      if (p.client_id) s.clients.add(p.client_id as string);
      stats.set(rid, s);
    }

    const comStats = new Map<
      string,
      { month: number; month_new: number; month_renewal: number; year: number; lifetime: number; collected: number }
    >();
    for (const c of com.data ?? []) {
      const rid = c.sales_rep_id as string;
      const s =
        comStats.get(rid) ??
        { month: 0, month_new: 0, month_renewal: 0, year: 0, lifetime: 0, collected: 0 };
      const amt = Number(c.amount ?? 0);
      const period = String(c.period ?? "");
      s.lifetime += amt;
      s.collected += Number(c.base_amount ?? 0);
      if (period.startsWith(thisYear)) s.year += amt;
      if (period.startsWith(thisMonth)) {
        s.month += amt;
        if (c.kind === "new") s.month_new += amt;
        else s.month_renewal += amt;
      }
      comStats.set(rid, s);
    }

    return reps.map((r) => {
      const s = stats.get(r.id) ?? { active: 0, total: 0, premium: 0, clients: new Set<string>() };
      const c =
        comStats.get(r.id) ??
        { month: 0, month_new: 0, month_renewal: 0, year: 0, lifetime: 0, collected: 0 };
      return {
        ...r,
        active_policies: s.active,
        total_policies: s.total,
        clients: s.clients.size,
        premium_total: s.premium,
        collected_total: c.collected,
        commission_month: c.month,
        commission_month_new: c.month_new,
        commission_month_renewal: c.month_renewal,
        commission_year: c.year,
        commission_lifetime: c.lifetime,
      };
    });
  });

/** Detailed portfolio + commission breakdown for one sales rep */
export const getSalesRepDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sales_rep_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const repQ = await sb
      .from("sales_reps")
      .select("id, full_name, referral_source, code, is_active, metadata")
      .eq("id", data.sales_rep_id)
      .maybeSingle();
    if (repQ.error) throw new Error(repQ.error.message);
    if (!repQ.data) throw new Error("Vendedor no encontrado");

    const polQ = await sb
      .from("policies")
      .select(
        "id, folio, status, premium, start_date, end_date, program_id, client_id, programs(code, name, color_primary), clients(id, first_name, last_name, email, phone, state)",
      )
      .eq("sales_rep_id", data.sales_rep_id)
      .order("start_date", { ascending: false });
    if (polQ.error) throw new Error(polQ.error.message);
    const policies = polQ.data ?? [];
    const policyIds = policies.map((p: any) => p.id);

    const comQ = await sb
      .from("sales_commissions")
      .select("id, policy_id, payment_id, kind, percentage, base_amount, amount, earned_at, period")
      .eq("sales_rep_id", data.sales_rep_id)
      .order("earned_at", { ascending: false });
    if (comQ.error) throw new Error(comQ.error.message);
    const commissions = comQ.data ?? [];

    // Client program status (prospect / active / inactive / cancelled)
    const clientIds = Array.from(
      new Set(policies.map((p: any) => p.client_id).filter(Boolean)),
    ) as string[];
    const cpMap = new Map<string, string>();
    if (clientIds.length) {
      const cpQ = await sb
        .from("client_programs")
        .select("client_id, program_id, status")
        .in("client_id", clientIds);
      if (!cpQ.error) {
        for (const cp of cpQ.data ?? []) {
          cpMap.set(`${cp.client_id}:${cp.program_id}`, cp.status as string);
        }
      }
    }

    // Payments for this portfolio (paid history + upcoming)
    let payments: any[] = [];
    if (policyIds.length) {
      const payQ = await sb
        .from("payments")
        .select("id, policy_id, amount, paid_amount, due_date, paid_at, status")
        .in("policy_id", policyIds)
        .order("due_date", { ascending: true });
      if (payQ.error) throw new Error(payQ.error.message);
      payments = payQ.data ?? [];
    }

    const paidByPolicy = new Map<string, number>();
    for (const p of payments) {
      if (p.status === "paid") paidByPolicy.set(p.policy_id, (paidByPolicy.get(p.policy_id) ?? 0) + 1);
    }

    const comByPolicy = new Map<string, number>();
    for (const c of commissions) {
      comByPolicy.set(c.policy_id as string, (comByPolicy.get(c.policy_id as string) ?? 0) + Number(c.amount ?? 0));
    }

    const nextByPolicy = new Map<string, any>();
    for (const p of payments) {
      if (p.status === "paid" || p.status === "cancelled" || p.status === "refunded") continue;
      if (!nextByPolicy.has(p.policy_id)) nextByPolicy.set(p.policy_id, p);
    }

    const rows = policies.map((p: any) => {
      const next = nextByPolicy.get(p.id) ?? null;
      const paidCount = paidByPolicy.get(p.id) ?? 0;
      const cpStatus = cpMap.get(`${p.client_id}:${p.program_id}`) ?? null;
      const estPct = paidCount === 0 ? COMMISSION_NEW : COMMISSION_RENEWAL;
      return {
        ...p,
        client_program_status: cpStatus,
        paid_payments: paidCount,
        commission_earned: comByPolicy.get(p.id) ?? 0,
        next_payment: next
          ? {
              id: next.id,
              due_date: next.due_date,
              amount: Number(next.amount ?? 0),
              status: next.status,
              estimated_percentage: estPct,
              estimated_commission: (Number(next.amount ?? 0) * estPct) / 100,
            }
          : null,
      };
    });

    const thisMonth = monthKey(new Date());
    const thisYear = String(new Date().getFullYear());
    let month = 0, monthNew = 0, monthRenewal = 0, year = 0, lifetime = 0, collected = 0;
    for (const c of commissions) {
      const amt = Number(c.amount ?? 0);
      const period = String(c.period ?? "");
      lifetime += amt;
      collected += Number(c.base_amount ?? 0);
      if (period.startsWith(thisYear)) year += amt;
      if (period.startsWith(thisMonth)) {
        month += amt;
        if (c.kind === "new") monthNew += amt;
        else monthRenewal += amt;
      }
    }

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 60);
    const upcoming = rows
      .filter((r: any) => r.next_payment?.due_date && new Date(r.next_payment.due_date) <= horizon)
      .sort(
        (a: any, b: any) =>
          new Date(a.next_payment.due_date).getTime() - new Date(b.next_payment.due_date).getTime(),
      )
      .slice(0, 20);

    return {
      rep: repQ.data,
      policies: rows,
      commissions,
      summary: {
        rates: { new: COMMISSION_NEW, renewal: COMMISSION_RENEWAL },
        commission_month: month,
        commission_month_new: monthNew,
        commission_month_renewal: monthRenewal,
        commission_year: year,
        commission_lifetime: lifetime,
        collected_total: collected,
        pipeline_commission: upcoming.reduce(
          (s: number, r: any) => s + (r.next_payment?.estimated_commission ?? 0),
          0,
        ),
      },
      upcoming,
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
    const term = data.search?.trim() ?? "";
    if (term.length >= 2) {
      // Match by folio, or by the titular's name / CURP.
      const cr = await context.supabase
        .from("clients")
        .select("id")
        .or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,curp.ilike.%${term}%`,
        )
        .limit(200);
      const clientIds = (cr.data ?? []).map((c: any) => c.id);
      const filters = [`folio.ilike.%${term}%`, `policy_number.ilike.%${term}%`];
      if (clientIds.length) filters.push(`client_id.in.(${clientIds.join(",")})`);
      q = q.or(filters.join(","));
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
