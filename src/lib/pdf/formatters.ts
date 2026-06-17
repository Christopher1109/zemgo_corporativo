// Reusable formatters for PDF templates.
// All locale-sensitive output is Spanish (es-MX).

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const date = formatDate(d);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mi}`;
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}

export function formatCURP(curp: string | null | undefined): string {
  if (!curp) return "—";
  return curp.toUpperCase().replace(/\s+/g, "").trim();
}

export function formatGender(g: string | null | undefined): string {
  switch ((g ?? "").toUpperCase()) {
    case "M": return "Masculino";
    case "F": return "Femenino";
    case "O": return "Otro";
    default: return "—";
  }
}

export function formatMaritalStatus(s: string | null | undefined): string {
  switch ((s ?? "").toLowerCase()) {
    case "single": return "Soltero(a)";
    case "married": return "Casado(a)";
    case "divorced": return "Divorciado(a)";
    case "widowed": return "Viudo(a)";
    case "common_law": return "Unión libre";
    default: return s ?? "—";
  }
}

export function calcAge(dob: string | Date | null | undefined): string {
  if (!dob) return "—";
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return String(age);
}

export interface BeneficiaryLike {
  full_name?: string | null;
  relationship?: string | null;
  percentage?: number | string | null;
}

/**
 * Returns a stable line string for a beneficiary, or an empty string when
 * the beneficiary is missing/incomplete. Never renders the literal "undefined".
 */
export function formatBeneficiary(b: BeneficiaryLike | null | undefined): string {
  if (!b || !b.full_name) return "";
  const rel = b.relationship ? ` (${b.relationship})` : "";
  const pct =
    b.percentage !== null && b.percentage !== undefined && b.percentage !== ""
      ? ` — ${b.percentage}%`
      : "";
  return `${b.full_name}${rel}${pct}`;
}

export function safe(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length === 0 ? fallback : s;
}
