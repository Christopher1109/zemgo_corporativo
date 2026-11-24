// Renovaciones de programas anuales (FutCare y Manos con Valor).
import { supabase } from "@/integrations/supabase/client";

export type RenewalStatus = "pendiente" | "renovado" | "vencido" | "cancelado";

export type RenewalRow = {
  policy_id: string;
  folio: string | null;
  certificate_number: string | null;
  client_id: string;
  client_name: string;
  phone: string | null;
  email: string | null;
  curp: string | null;
  start_date: string | null;
  end_date: string;
  policy_status: string;
  renewal_status: RenewalStatus;
  expected_amount: number;
  paid_amount: number;
  paid_at: string | null;
  renewal_payment_id: string | null;
  renewed_policy_id: string | null;
};

/** Programas que tienen módulo de Renovaciones (cobro anual). */
export const RENEWAL_PROGRAMS = ["FUTCARE", "MCV"];
export const hasRenewals = (code?: string | null) => RENEWAL_PROGRAMS.includes(String(code ?? "").toUpperCase());

/** "2026-12" → primer y último día del mes. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Mes de hoy + offset en formato YYYY-MM (zona de Monterrey). */
export function monthFromToday(offset = 0): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
  const [y, m] = today.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function fetchRenewals(programId: string, from: string, to: string): Promise<RenewalRow[]> {
  const { data, error } = await (supabase.rpc as any)("get_renewals", { _program_id: programId, _from: from, _to: to });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    expected_amount: Number(r.expected_amount ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
  }));
}

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  pendiente: "Por renovar",
  renovado: "Renovado",
  vencido: "Vencido sin renovar",
  cancelado: "Cancelado",
};

export const RENEWAL_STATUS_CLASS: Record<RenewalStatus, string> = {
  pendiente: "bg-sky-100 text-sky-800 border-sky-300",
  renovado: "bg-emerald-100 text-emerald-800 border-emerald-300",
  vencido: "bg-red-100 text-red-800 border-red-300",
  cancelado: "bg-gray-100 text-gray-600 border-gray-300",
};
