// Vigencia que se muestra al cliente.
// ABC de Protección es de vigencia MENSUAL: se renueva cada mes el mismo día de la fecha de alta
// (si se dio de alta el 11, cada periodo va del 11 al 11). Las fechas guardadas en la póliza
// (start_date = alta, end_date = fin del año con la aseguradora) no se modifican; aquí solo se calcula
// el mes en curso. FutCare, MCV y demás programas anuales muestran sus fechas tal cual.

const MONTHLY_CODES = new Set(["ABC"]);

export function isMonthlyProgram(code?: string | null, billingFrequency?: string | null): boolean {
  return billingFrequency === "monthly" || MONTHLY_CODES.has(String(code ?? "").toUpperCase());
}

type Ymd = { y: number; m: number; d: number }; // m: 0-11

function parseYmd(iso?: string | null): Ymd | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return r ? { y: Number(r[1]), m: Number(r[2]) - 1, d: Number(r[3]) } : null;
}
const toIso = (v: Ymd) => `${v.y}-${String(v.m + 1).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
const cmp = (a: Ymd, b: Ymd) => a.y - b.y || a.m - b.m || a.d - b.d;

/** Suma meses a la fecha de alta conservando el día (si el mes es más corto, el último día del mes). */
function addMonths(base: Ymd, n: number): Ymd {
  const total = base.m + n;
  const y = base.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return { y, m, d: Math.min(base.d, last) };
}

export type CoveragePeriod = { from: string | null; to: string | null; monthly: boolean };

/**
 * Vigencia a mostrar. Para programas mensuales: el periodo de un mes (anclado al día de alta) que contiene
 * la fecha de referencia (hoy). Nunca va más allá del fin de la póliza.
 */
export function coveragePeriod(
  policy: { start_date?: string | null; end_date?: string | null },
  programCode?: string | null,
  billingFrequency?: string | null,
  today: Date = new Date(),
): CoveragePeriod {
  const start = policy.start_date ?? null;
  const end = policy.end_date ?? null;
  if (!isMonthlyProgram(programCode, billingFrequency)) return { from: start, to: end, monthly: false };
  const alta = parseYmd(start);
  if (!alta) return { from: start, to: end, monthly: true };
  let ref: Ymd = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
  const fin = parseYmd(end);
  if (fin && cmp(ref, fin) >= 0) {
    // Póliza terminada: se muestra su último mes.
    const prev = new Date(fin.y, fin.m, fin.d - 1);
    ref = { y: prev.getFullYear(), m: prev.getMonth(), d: prev.getDate() };
  }
  let n = (ref.y - alta.y) * 12 + (ref.m - alta.m);
  if (cmp(addMonths(alta, n), ref) > 0) n--;
  if (n < 0) n = 0;
  return { from: toIso(addMonths(alta, n)), to: toIso(addMonths(alta, n + 1)), monthly: true };
}
