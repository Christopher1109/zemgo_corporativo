export type ProgramPrice = { default_premium?: number | string | null; billing_frequency?: string | null } | null | undefined;

export function fmtMoney(n: number | string | null | undefined) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

/** "$199 / mes" o "$950 / año" — lo que paga el cliente. */
export function fmtProgramPrice(p: ProgramPrice) {
  if (!p?.default_premium) return "—";
  const n = Number(p.default_premium);
  const s = `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
  return `${s} / ${p.billing_frequency === "monthly" ? "mes" : "año"}`;
}

/** Ingreso anual esperado por certificado (ABC mensual × 12). */
export function annualPrice(p: ProgramPrice) {
  if (!p?.default_premium) return 0;
  return Number(p.default_premium) * (p.billing_frequency === "monthly" ? 12 : 1);
}
