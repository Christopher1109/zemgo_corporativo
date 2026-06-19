// Server-only data assembly for each report.
// Receives an authenticated supabase client (RLS as the caller).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFilters } from "./types";

function dateOrNull(v: any) { return v && typeof v === "string" ? v : null; }
function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export type ReportResult = { rows: any[]; kpis?: Array<{ label: string; value: string }> };

export async function queryCartera(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  let q = supabase.from("policies").select(`
      folio, start_date, end_date, sum_insured, status,
      programs(code, name),
      clients(first_name, last_name, curp)
    `).order("start_date", { ascending: false }).limit(5000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("program_id", filters.program_id);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  const from = dateOrNull(filters.date_from); const to = dateOrNull(filters.date_to);
  if (from) q = q.gte("start_date", from);
  if (to) q = q.lte("start_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((r: any) => ({
    client_name: `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim(),
    curp: r.clients?.curp ?? "",
    program_code: r.programs?.code ?? "",
    folio: r.folio,
    start_date: r.start_date,
    end_date: r.end_date,
    sum_insured: Number(r.sum_insured ?? 0),
    status: r.status,
  }));
  return { rows };
}

export async function queryCobranza(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  let q = supabase.from("payments").select(`
      id, amount, paid_amount, due_date, paid_at, method, status,
      policies!inner(folio, program_id, clients(first_name, last_name))
    `).order("due_date", { ascending: false }).limit(5000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("policies.program_id", filters.program_id);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  const from = dateOrNull(filters.date_from); const to = dateOrNull(filters.date_to);
  if (from) q = q.gte("due_date", from);
  if (to) q = q.lte("due_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).map((r: any) => {
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
  return { rows };
}

export async function querySiniestralidad(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  let q = supabase.from("incidents").select(`
      id, accident_date, description, hospital, status,
      policies!inner(folio, program_id, sum_insured, clients(first_name, last_name)),
      medical_passes(id)
    `).order("accident_date", { ascending: false }).limit(5000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("policies.program_id", filters.program_id);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  const from = dateOrNull(filters.date_from); const to = dateOrNull(filters.date_to);
  if (from) q = q.gte("accident_date", from);
  if (to) q = q.lte("accident_date", to);
  if (filters.hospital) q = q.ilike("hospital", `%${filters.hospital}%`);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((r: any) => ({
    incident_folio: r.id?.slice(0, 8) ?? "",
    client_name: `${r.policies?.clients?.first_name ?? ""} ${r.policies?.clients?.last_name ?? ""}`.trim(),
    folio: r.policies?.folio ?? "",
    accident_date: r.accident_date,
    description: truncate(r.description, 80),
    hospital: r.hospital ?? "",
    status: r.status,
    passes_count: (r.medical_passes ?? []).length,
    sum_insured: Number(r.policies?.sum_insured ?? 0),
  }));

  // KPIs: total / approved (pass_issued+closed+in_treatment) / rejected / exposed amount + claim rate
  const total = rows.length;
  const approved = rows.filter(r => ["pass_issued","in_treatment","closed","pass_expired"].includes(r.status)).length;
  const rejected = rows.filter(r => r.status === "rejected").length;
  const exposed = rows.reduce((s, r) => s + r.sum_insured, 0);
  // Active policies for the same filter scope
  let polQ = supabase.from("policies").select("id", { count: "exact", head: true }).eq("status", "active");
  if (filters.program_id && filters.program_id !== "all") polQ = polQ.eq("program_id", filters.program_id);
  const { count: activePolCount } = await polQ;
  const rate = activePolCount && activePolCount > 0 ? (total / activePolCount) * 100 : 0;

  return {
    rows,
    kpis: [
      { label: "Total incidentes", value: String(total) },
      { label: "Aprobados", value: String(approved) },
      { label: "Rechazados", value: String(rejected) },
      { label: "Pólizas activas", value: String(activePolCount ?? 0) },
      { label: "Tasa siniestralidad", value: `${rate.toFixed(2)}%` },
      { label: "Monto expuesto", value: exposed.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }) },
    ],
  };
}

export async function queryRenovaciones(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  const win = Number(filters.window_days ?? 30);
  const today = new Date();
  const future = new Date(); future.setDate(today.getDate() + win);
  const todayStr = today.toISOString().slice(0, 10);
  const futureStr = future.toISOString().slice(0, 10);
  // include policies already expired up to 30 days ago
  const past = new Date(); past.setDate(today.getDate() - 30);
  const pastStr = past.toISOString().slice(0, 10);

  let q = supabase.from("policies").select(`
      id, folio, end_date, premium, status,
      programs(code), clients(first_name, last_name),
      renewal_contacts(id, contacted_at),
      replaced:policies!renewed_from_id(id, folio)
    `).gte("end_date", pastStr).lte("end_date", futureStr)
     .in("status", ["active","expired"]).order("end_date", { ascending: true }).limit(5000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("program_id", filters.program_id);
  const { data, error } = await q;
  if (error) throw error;

  const today0 = Date.parse(todayStr);
  let rows = (data ?? []).map((r: any) => {
    const days = Math.floor((Date.parse(r.end_date) - today0) / 86400000);
    const wasContacted = (r.renewal_contacts ?? []).length > 0;
    const wasRenewed = (r.replaced ?? []).length > 0;
    const rstatus = wasRenewed ? "renewed" : wasContacted ? "contacted" : "pending";
    return {
      policy_id: r.id,
      client_name: `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim(),
      folio: r.folio,
      end_date: r.end_date,
      days_to_expire: days,
      premium: Number(r.premium ?? 0),
      renewal_status: rstatus,
      renewal_status_label: rstatus === "renewed" ? "Renovado" : rstatus === "contacted" ? "Contactado" : "Por contactar",
    };
  });
  if (filters.renewal_status && filters.renewal_status !== "all") {
    rows = rows.filter((r: any) => r.renewal_status === filters.renewal_status);
  }
  return { rows };
}

export async function queryVentas(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  // Get sales reps
  let repsQ = supabase.from("sales_reps").select("id, full_name, referral_source");
  if (Array.isArray(filters.sales_rep_ids) && filters.sales_rep_ids.length > 0) {
    repsQ = repsQ.in("id", filters.sales_rep_ids);
  }
  const { data: reps, error: repsErr } = await repsQ;
  if (repsErr) throw repsErr;
  if (!reps || reps.length === 0) return { rows: [] };

  // For each rep, count clients & their policies in scope
  const fromD = dateOrNull(filters.date_from);
  const toD = dateOrNull(filters.date_to);

  let cliQ = supabase.from("clients").select("id, sales_rep_id, created_at");
  if (fromD) cliQ = cliQ.gte("created_at", fromD);
  if (toD) cliQ = cliQ.lte("created_at", toD + "T23:59:59");
  const { data: clients, error: cliErr } = await cliQ;
  if (cliErr) throw cliErr;
  const clientsByRep = new Map<string, string[]>();
  (clients ?? []).forEach((c: any) => {
    if (!c.sales_rep_id) return;
    const arr = clientsByRep.get(c.sales_rep_id) ?? [];
    arr.push(c.id); clientsByRep.set(c.sales_rep_id, arr);
  });

  let polQ = supabase.from("policies").select("id, client_id, premium, status, program_id");
  if (filters.program_id && filters.program_id !== "all") polQ = polQ.eq("program_id", filters.program_id);
  const { data: pols, error: polErr } = await polQ;
  if (polErr) throw polErr;

  const rows = reps.map((rep: any) => {
    const cids = clientsByRep.get(rep.id) ?? [];
    const cset = new Set(cids);
    const repPols = (pols ?? []).filter((p: any) => cset.has(p.client_id));
    const issued = repPols.length;
    const activeCount = repPols.filter((p: any) => p.status === "active").length;
    const totalPremium = repPols.reduce((s, p: any) => s + Number(p.premium ?? 0), 0);
    const conversion = cids.length > 0 ? (activeCount / cids.length) * 100 : 0;
    return {
      sales_rep_name: rep.full_name,
      source: rep.referral_source ?? "",
      clients_captured: cids.length,
      policies_issued: issued,
      total_premium: totalPremium,
      conversion_rate: Number(conversion.toFixed(1)),
    };
  });
  return { rows };
}

export async function queryActividad(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportResult> {
  // Admin-only enforced at server fn level. RLS on audit_log applies.
  let q = supabase.from("audit_log").select(`
      id, created_at, user_id, action, entity_type, entity_id, program_id, ip_address,
      programs(code), profiles!audit_log_user_id_fkey(full_name)
    `).order("created_at", { ascending: false }).limit(10000);
  if (filters.program_id && filters.program_id !== "all") q = q.eq("program_id", filters.program_id);
  const fromD = dateOrNull(filters.date_from);
  const toD = dateOrNull(filters.date_to);
  if (fromD) q = q.gte("created_at", fromD);
  if (toD) q = q.lte("created_at", toD + "T23:59:59");
  if (Array.isArray(filters.user_ids) && filters.user_ids.length > 0) q = q.in("user_id", filters.user_ids);
  if (Array.isArray(filters.actions) && filters.actions.length > 0) q = q.in("action", filters.actions);
  if (Array.isArray(filters.entities) && filters.entities.length > 0) q = q.in("entity_type", filters.entities);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((r: any) => ({
    created_at: r.created_at,
    user_name: r.profiles?.full_name ?? "Sistema",
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id ?? "",
    program_code: r.programs?.code ?? "",
    ip_address: r.ip_address ?? "",
  }));
  return { rows };
}

export type ReportQueryFn = (s: SupabaseClient, f: ReportFilters) => Promise<ReportResult>;
export const REPORT_QUERIES: Record<string, ReportQueryFn> = {
  cartera: queryCartera,
  cobranza: queryCobranza,
  siniestralidad: querySiniestralidad,
  renovaciones: queryRenovaciones,
  ventas: queryVentas,
  actividad: queryActividad,
};
