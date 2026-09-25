// Browser-side Excel helpers for client exports (RLS enforces program access).
import { supabase } from "@/integrations/supabase/client";

export const GENDER_LABEL: Record<string, string> = { M: "Masculino", F: "Femenino", H: "Masculino" };
export const MARITAL_LABEL: Record<string, string> = {
  soltero: "Soltero(a)", casado: "Casado(a)", union_libre: "Unión libre", divorciado: "Divorciado(a)", viudo: "Viudo(a)",
};

export function fullName(c: any) {
  return `${c?.last_name ?? ""} ${c?.first_name ?? ""}`.replace(/\s+/g, " ").trim();
}
export function normalizeName(s: string) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}
export function ageFrom(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}
export function genderFromCurp(curp?: string | null) {
  const g = curp?.[10]?.toUpperCase();
  return g === "H" ? "Masculino" : g === "M" ? "Femenino" : "";
}

const CLIENT_SELECT =
  "id, first_name, last_name, curp, rfc, date_of_birth, gender, marital_status, email, phone, phone_alt, street, number, colonia, city, state, zip, address_full, payer_name, payer_phone, created_at, sales_reps(full_name), companies(legal_name)";

/** All clients enrolled in a program, with their policies (and payments) of that program. */
export async function fetchProgramClients(programId: string, withPolicies = false) {
  const out: any[] = [];
  const pol = withPolicies
    ? ", policies(id, folio, policy_number, certificate_number, status, start_date, end_date, premium, program_id, metadata, payments(amount, status, paid_at, due_date))"
    : "";
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("client_programs")
      .select(`status, enrolled_at, clients(${CLIENT_SELECT}${pol})`)
      .eq("program_id", programId)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const c: any = (r as any).clients;
      if (!c) continue;
      if (withPolicies) c.policies = (c.policies ?? []).filter((p: any) => p.program_id === programId);
      out.push({ ...c, enrollment_status: (r as any).status, enrolled_at: (r as any).enrolled_at });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function downloadWorkbook(wb: any, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function newWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

export function styleHeader(ws: any) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c: any) => { c.width = Math.max(14, String(c.header ?? "").length + 4); });
}

export const EMPTY_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };

export function slugDate() {
  return new Date().toISOString().slice(0, 10);
}
