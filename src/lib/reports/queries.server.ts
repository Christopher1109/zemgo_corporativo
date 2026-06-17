// Server-only data assembly for each report.
// Receives an authenticated supabase client (RLS as the caller).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFilters } from "./types";

function dateOrNull(v: any) { return v && typeof v === "string" ? v : null; }

export async function queryCartera(
  supabase: SupabaseClient,
  filters: ReportFilters,
): Promise<any[]> {
  let q = supabase
    .from("policies")
    .select(`
      folio, start_date, end_date, sum_insured, status,
      programs(code, name),
      clients(first_name, last_name, curp)
    `)
    .order("start_date", { ascending: false })
    .limit(5000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("program_id", filters.program_id);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  const from = dateOrNull(filters.date_from);
  const to = dateOrNull(filters.date_to);
  if (from) q = q.gte("start_date", from);
  if (to) q = q.lte("start_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    client_name: `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim(),
    curp: r.clients?.curp ?? "",
    program_code: r.programs?.code ?? "",
    folio: r.folio,
    start_date: r.start_date,
    end_date: r.end_date,
    sum_insured: Number(r.sum_insured ?? 0),
    status: r.status,
  }));
}

export async function queryCobranza(
  supabase: SupabaseClient,
  filters: ReportFilters,
): Promise<any[]> {
  let q = supabase
    .from("payments")
    .select(`
      id, amount, paid_amount, due_date, paid_at, method, status,
      policies!inner(folio, program_id, clients(first_name, last_name))
    `)
    .order("due_date", { ascending: false })
    .limit(5000);
  if (filters.program_id && filters.program_id !== "all") {
    q = q.eq("policies.program_id", filters.program_id);
  }
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  const from = dateOrNull(filters.date_from);
  const to = dateOrNull(filters.date_to);
  if (from) q = q.gte("due_date", from);
  if (to) q = q.lte("due_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).map((r: any) => {
    const days = r.status === "paid" || !r.due_date ? 0
      : Math.max(0, Math.floor((Date.parse(today) - Date.parse(r.due_date)) / 86400000));
    return {
      client_name: `${r.policies?.clients?.first_name ?? ""} ${r.policies?.clients?.last_name ?? ""}`.trim(),
      folio: r.policies?.folio ?? "",
      amount: Number(r.paid_amount ?? r.amount ?? 0),
      due_date: r.due_date,
      paid_at: r.paid_at ? r.paid_at.slice(0, 10) : null,
      method: r.method ?? "",
      status: r.status,
      days_overdue: days,
    };
  });
}

export type ReportQueryFn = (s: SupabaseClient, f: ReportFilters) => Promise<any[]>;
export const REPORT_QUERIES: Record<string, ReportQueryFn> = {
  cartera: queryCartera,
  cobranza: queryCobranza,
};
