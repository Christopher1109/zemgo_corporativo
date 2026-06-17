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
