// Client-side helpers that hit security-definer RPCs.
// All queries respect RLS via the authenticated user; RPCs internally filter
// by user_program_access so "Todos" mode = aggregate of every accessible program.
import { supabase } from "@/integrations/supabase/client";

export type Scope = string | null; // program_id, or null for "all accessible"

export type Kpis = {
  active_clients: number;
  active_policies: number;
  mtd_collected: number;
  prev_month_collected: number;
  open_incidents: number;
  urgent_incidents: number;
  renewals_30d: number;
  paid_count_mtd: number;
  overdue_count: number;
};

export async function fetchKpis(scope: Scope): Promise<Kpis> {
  const { data, error } = await supabase.rpc("get_dashboard_kpis" as any, {
    _program_id: scope,
  });
  if (error) throw error;
  return (data as Kpis) ?? ({} as Kpis);
}

export type Distribution = { program_id: string; code: string; name: string; color: string; count: number };
export async function fetchPolicyDistribution(): Promise<Distribution[]> {
  const { data, error } = await supabase.rpc("get_policy_distribution" as any);
  if (error) throw error;
  return (data as any[]).map((r) => ({ ...r, count: Number(r.count) }));
}

export type Debtor = { client_id: string; full_name: string; program_code: string; total_overdue: number; oldest_due: string };
export async function fetchTopDebtors(scope: Scope): Promise<Debtor[]> {
  const { data, error } = await supabase.rpc("get_top_debtors" as any, { _program_id: scope, _limit: 10 });
  if (error) throw error;
  return (data as any[]).map((r) => ({ ...r, total_overdue: Number(r.total_overdue) }));
}

export type MonthRow = { program_id: string; month: string; total: number; count?: number };

export async function fetchMonthlyCollection(scope: Scope): Promise<MonthRow[]> {
  let q = (supabase.from as any)("mv_monthly_collection").select("program_id, month, total").order("month");
  if (scope) q = q.eq("program_id", scope);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any[]).map((r) => ({ program_id: r.program_id, month: r.month, total: Number(r.total) }));
}

export async function fetchMonthlyNewClients(scope: Scope): Promise<MonthRow[]> {
  let q = (supabase.from as any)("mv_monthly_new_clients").select("program_id, month, count").order("month");
  if (scope) q = q.eq("program_id", scope);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any[]).map((r) => ({ program_id: r.program_id, month: r.month, total: Number(r.count), count: Number(r.count) }));
}

export type ActionItems = {
  pending_incidents: Array<{ id: string; reported_at: string; client_name: string; program_code: string }>;
  risk_payments: Array<{ id: string; amount: number; due_date: string; folio: string; program_code: string; client_name: string; days_overdue: number }>;
  upcoming_renewals: Array<{ id: string; folio: string; end_date: string; program_code: string; client_name: string }>;
  inactive_users: Array<{ id: string; full_name: string; last_action: string | null }>;
};
export async function fetchActionItems(scope: Scope): Promise<ActionItems> {
  const { data, error } = await supabase.rpc("get_action_items" as any, { _program_id: scope });
  if (error) throw error;
  return data as ActionItems;
}

export type ActivityRow = {
  id: string; created_at: string; user_name: string; action: string;
  entity_type: string; entity_id: string | null; program_id: string | null;
  program_code: string | null; diff: any;
};
export async function fetchRecentActivity(scope: Scope, limit = 20): Promise<ActivityRow[]> {
  const { data, error } = await supabase.rpc("get_recent_activity" as any, { _program_id: scope, _limit: limit });
  if (error) throw error;
  return (data as ActivityRow[]) ?? [];
}

// ---------------- Cobranza unificada (clientes + empresas + torneos) ----------------
// Todo sale de la vista v_cobranza / RPC get_cobranza_resumen para que el
// dashboard, Finanzas, Alertas, Pagos y Reportes cuadren entre sí.

export type CobranzaKind = "cliente" | "empresa" | "torneo" | "torneo_jugador";
export const COBRANZA_KIND_LABEL: Record<CobranzaKind, string> = {
  cliente: "Cliente",
  empresa: "Empresa",
  torneo: "Torneo / equipo",
  torneo_jugador: "Jugador de torneo",
};

export type CobranzaResumen = {
  por_cobrar: number;
  por_cobrar_count: number;
  vencido: number;
  vencido_count: number;
  cobrado_mes: number;
  cobrado_mes_count: number;
  cobrado_mes_anterior: number;
  activaciones: number;
  activaciones_count: number;
  por_tipo: Record<"cliente" | "empresa" | "torneo", { por_cobrar: number; vencido: number; cobrado_mes: number }>;
};

export async function fetchCobranzaResumen(scope: Scope): Promise<CobranzaResumen> {
  const { data, error } = await supabase.rpc("get_cobranza_resumen" as any, { _program_id: scope });
  if (error) throw error;
  const d: any = data ?? {};
  const n = (v: any) => Number(v ?? 0);
  const tipo = (k: string) => ({
    por_cobrar: n(d.por_tipo?.[k]?.por_cobrar),
    vencido: n(d.por_tipo?.[k]?.vencido),
    cobrado_mes: n(d.por_tipo?.[k]?.cobrado_mes),
  });
  return {
    por_cobrar: n(d.por_cobrar),
    por_cobrar_count: n(d.por_cobrar_count),
    vencido: n(d.vencido),
    vencido_count: n(d.vencido_count),
    cobrado_mes: n(d.cobrado_mes),
    cobrado_mes_count: n(d.cobrado_mes_count),
    cobrado_mes_anterior: n(d.cobrado_mes_anterior),
    activaciones: n(d.activaciones),
    activaciones_count: n(d.activaciones_count),
    por_tipo: { cliente: tipo("cliente"), empresa: tipo("empresa"), torneo: tipo("torneo") },
  };
}

export type CobranzaRow = {
  kind: CobranzaKind;
  source: "payments" | "company_charges";
  id: string;
  program_id: string;
  program_code: string;
  program_name: string;
  program_color: string | null;
  debtor_name: string;
  group_name: string | null;
  client_id: string | null;
  company_id: string | null;
  policy_id: string | null;
  folio: string | null;
  curp: string | null;
  policy_status: string | null;
  amount: number;
  paid_amount: number | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  method: string | null;
  bank_reference: string | null;
  is_activation: boolean;
  insured_count: number | null;
  period: string | null;
};

/** A dónde lleva cada renglón de cobranza. */
export function cobranzaLink(r: Pick<CobranzaRow, "kind" | "source" | "id" | "company_id">):
  | { to: "/payments/$paymentId"; params: { paymentId: string } }
  | { to: "/companies/$companyId"; params: { companyId: string } } {
  if (r.kind === "empresa" || r.kind === "torneo") return { to: "/companies/$companyId", params: { companyId: r.company_id! } };
  return { to: "/payments/$paymentId", params: { paymentId: r.id } };
}

/** Descripción corta del renglón: folio del certificado, o empresa/torneo con # de asegurados. */
export function cobranzaDetail(r: CobranzaRow): string {
  if (r.kind === "empresa") {
    const p = r.period ? new Date(`${r.period}T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" }) : "";
    return `Empresa · mensualidad ${p}${r.insured_count ? ` · ${r.insured_count} asegurados` : ""}`;
  }
  if (r.kind === "torneo") return `Torneo / equipo · cobro grupal${r.insured_count ? ` · ${r.insured_count} jugadores` : ""}`;
  if (r.kind === "torneo_jugador") return `Folio ${r.folio ?? "—"} · ${r.group_name ?? "Torneo"}`;
  return `Folio ${r.folio ?? "—"}`;
}

export const isCobranzaOverdue = (r: Pick<CobranzaRow, "status" | "due_date">) =>
  r.status === "overdue" ||
  (r.status === "pending" && !!r.due_date && r.due_date < new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" }));

/** Cobros abiertos (Por cobrar): próximos 30 días + vencidos, sin activaciones de prospectos. */
export async function fetchCobranzaAbierta(scope: Scope, limit = 50): Promise<CobranzaRow[]> {
  const horizon = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
  let q = (supabase.from as any)("v_cobranza")
    .select("*")
    .in("status", ["pending", "overdue"])
    .eq("is_activation", false)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true })
    .limit(limit);
  if (scope) q = q.eq("program_id", scope);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount), paid_amount: r.paid_amount == null ? null : Number(r.paid_amount) }));
}
