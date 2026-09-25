import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortfolioClient = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  program_name: string | null;
  active_policies: number;
};

export type PortfolioRenewal = {
  policy_id: string;
  folio: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  start_date: string | null;
  end_date: string | null;
  days_to_expire: number | null;
  renewed: boolean;
};

export type PortfolioPayment = {
  id: string;
  client_name: string;
  folio: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  estimated_commission: number;
  commission_rate: number;
};

export type PortfolioCommission = {
  id: string;
  client_name: string;
  folio: string | null;
  paid_at: string | null;
  kind: string | null;
  base_amount: number | null;
  rate: number | null;
  amount: number | null;
};

export type SalesRepPortfolio = {
  rep: {
    id: string;
    full_name: string;
    ref_slug: string | null;
    code: string | null;
    program_id: string | null;
  };
  kpis: {
    clients: number;
    active_policies: number;
    commission_month: number;
    commission_year: number;
    commission_next_60d: number;
  };
  clients: PortfolioClient[];
  renewals: {
    expiring: PortfolioRenewal[];
    expired_unrenewed: PortfolioRenewal[];
    renewed: PortfolioRenewal[];
  };
  payments: {
    overdue: PortfolioPayment[];
    upcoming: PortfolioPayment[];
  };
  commissions: {
    new_this_month: number;
    renewals_this_month: number;
    total_this_month: number;
    total_historic: number;
    detail: PortfolioCommission[];
  };
};

export const getMySalesRepPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalesRepPortfolio | null> => {
    const { supabase } = context;

    const { data: repId } = await supabase.rpc("current_sales_rep_id");
    if (!repId) return null;

    const { data: rep } = await supabase
      .from("sales_reps")
      .select("id, full_name, ref_slug, code, program_id")
      .eq("id", repId)
      .single();
    if (!rep) return null;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in60 = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const yearStart = `${now.getFullYear()}-01-01`;

    const [clientsRes, policiesRes, paymentsRes, commissionsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone, client_programs(status, programs(name))")
        .eq("sales_rep_id", repId),
      supabase
        .from("policies")
        .select("id, folio, status, start_date, end_date, metadata, client_id, clients(first_name, last_name, phone, email)")
        .eq("sales_rep_id", repId),
      supabase
        .from("payments")
        .select("id, amount, due_date, status, policy_id, policies(folio, clients(full_name))")
        .in(
          "policy_id",
          (
            await supabase.from("policies").select("id").eq("sales_rep_id", repId)
          ).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"],
        ),
      supabase
        .from("sales_commissions")
        .select("id, amount, base_amount, rate, kind, created_at, payments(paid_at, policies(folio, clients(full_name)))")
        .eq("sales_rep_id", repId),
    ]);

    const policies = policiesRes.data ?? [];
    const policyIds = new Set(policies.map((p) => p.id));
    const activePolicies = policies.filter((p) => p.status === "active");

    // Conteo de pagos cobrados por póliza (para estimar 20% primer pago / 10% resto)
    const paidCountByPolicy = new Map<string, number>();
    for (const pay of paymentsRes.data ?? []) {
      if (pay.status === "paid" && pay.policy_id) {
        paidCountByPolicy.set(pay.policy_id, (paidCountByPolicy.get(pay.policy_id) ?? 0) + 1);
      }
    }

    const clients: PortfolioClient[] = (clientsRes.data ?? []).map((c) => {
      const cp = Array.isArray(c.client_programs) ? c.client_programs[0] : c.client_programs;
      const prog = cp?.programs;
      return {
        id: c.id,
        full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        email: c.email,
        phone: c.phone,
        status: cp?.status ?? null,
        program_name: prog && !Array.isArray(prog) ? prog.name : null,
        active_policies: 0,
      };
    });
    const activeByClient = new Map<string, number>();
    for (const p of activePolicies) {
      const cid = (p as any).client_id ?? null;
      if (cid) activeByClient.set(cid, (activeByClient.get(cid) ?? 0) + 1);
    }

    const days = (d: string | null) =>
      d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;

    const clientName = (c: any) =>
      c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || "—" : "—";
    const metaOf = (p: any) => (p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {}) as Record<string, any>;

    const toRenewal = (p: any): PortfolioRenewal => ({
      policy_id: p.id,
      folio: p.folio,
      client_name: clientName(p.clients),
      client_phone: p.clients?.phone ?? null,
      client_email: p.clients?.email ?? null,
      start_date: p.start_date,
      end_date: p.end_date,
      days_to_expire: days(p.end_date),
      renewed: !!metaOf(p).replaced_by,
    });

    const withEnd = policies.filter((p) => p.end_date);
    const expiring = withEnd
      .filter((p) => p.status === "active" && p.end_date! >= today && p.end_date! <= in60)
      .map(toRenewal)
      .sort((a, b) => (a.days_to_expire ?? 0) - (b.days_to_expire ?? 0));
    const expiredUnrenewed = withEnd
      .filter((p) => p.end_date! < today && !metaOf(p).replaced_by)
      .map(toRenewal);
    const renewed = withEnd.filter((p) => !!metaOf(p).replaced_by).map(toRenewal);

    const toPayment = (pay: any): PortfolioPayment => {
      const paidCount = paidCountByPolicy.get(pay.policy_id) ?? 0;
      const rate = paidCount === 0 ? 0.2 : 0.1;
      return {
        id: pay.id,
        client_name: pay.policies?.clients?.full_name ?? "—",
        folio: pay.policies?.folio ?? null,
        amount: pay.amount ?? 0,
        due_date: pay.due_date,
        status: pay.status,
        commission_rate: rate,
        estimated_commission: Math.round((pay.amount ?? 0) * rate * 100) / 100,
      };
    };

    const openPayments = (paymentsRes.data ?? []).filter(
      (p) => p.policy_id && policyIds.has(p.policy_id) && p.status !== "paid" && p.status !== "cancelled",
    );
    const overdue = openPayments
      .filter((p) => p.status === "overdue" || ((p.status === "pending" || p.status === "failed") && p.due_date && p.due_date < today))
      .map(toPayment)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    const upcoming = openPayments
      .filter((p) => p.due_date && p.due_date >= today && p.due_date <= in60)
      .map(toPayment)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

    const commissions = commissionsRes.data ?? [];
    const toCommission = (c: any): PortfolioCommission => ({
      id: c.id,
      client_name: c.payments?.policies?.clients?.full_name ?? "—",
      folio: c.payments?.policies?.folio ?? null,
      paid_at: c.payments?.paid_at ?? c.created_at,
      kind: c.kind,
      base_amount: c.base_amount,
      rate: c.rate,
      amount: c.amount,
    });
    const detail = commissions.map(toCommission).sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
    const inMonth = commissions.filter((c) => (c.created_at ?? "") >= monthStart);
    const inYear = commissions.filter((c) => (c.created_at ?? "") >= yearStart);
    const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0);

    return {
      rep: {
        id: rep.id,
        full_name: rep.full_name,
        ref_slug: rep.ref_slug,
        code: rep.code,
        program_id: rep.program_id,
      },
      kpis: {
        clients: clients.length,
        active_policies: activePolicies.length,
        commission_month: sum(inMonth),
        commission_year: sum(inYear),
        commission_next_60d: upcoming.reduce((s, p) => s + p.estimated_commission, 0),
      },
      clients: clients.map((c) => ({ ...c, active_policies: activeByClient.get(c.id) ?? 0 })),
      renewals: { expiring, expired_unrenewed: expiredUnrenewed, renewed },
      payments: { overdue, upcoming },
      commissions: {
        new_this_month: sum(inMonth.filter((c) => c.kind === "new")),
        renewals_this_month: sum(inMonth.filter((c) => c.kind !== "new")),
        total_this_month: sum(inMonth),
        total_historic: sum(commissions),
        detail,
      },
    };
  });
