// Emparejamiento de la relación de asegurados de la aseguradora (HIR) con los certificados de Zemgo.
import { normalizeName } from "@/lib/client-excel";
import type { InsurerRow } from "@/lib/insurer-file-parser";

const tokens = (s: string) => normalizeName(s).split(" ").filter(Boolean);
const tokenKey = (s: string) => tokens(s).sort().join(" ");
function nameScore(a: string, b: string) {
  const ta = new Set(tokens(a));
  return tokens(b).filter((t) => ta.has(t)).length;
}
const clientName = (p: any) => `${p.clients?.first_name ?? ""} ${p.clients?.last_name ?? ""}`;
/** Fecha de nacimiento que trae el RFC (AAMMDD) en formato yymmdd para comparar. */
const rfcDate = (rfc: string) => (rfc.match(/^[A-ZÑ&]{3,4}(\d{6})/)?.[1] ?? "");
const dobKey = (dob?: string | null) => (dob ? dob.replace(/-/g, "").slice(2, 8) : "");
const idPrefix = (p: any) => String(p.clients?.curp ?? "").toUpperCase().replace(/^SIN-CURP-/, "").slice(0, 10) || String(p.clients?.rfc ?? "").toUpperCase().slice(0, 10);

/** Empareja un renglón de la relación de HIR con un certificado de Zemgo: número de certificado, RFC/CURP, nombre o fecha de nacimiento. */
export function matchRow(row: InsurerRow, pols: any[]): { policy?: any; how?: string; options?: any[] } {
  const byCert = pols.filter((p) => String(p.certificate_number ?? "") === row.certificate_number);
  const nameOk = (p: any) => nameScore(row.name, clientName(p)) >= 2;
  if (byCert.length === 1 && nameOk(byCert[0])) return { policy: byCert[0], how: "Mismo número" };

  const free = (ps: any[]) => ps.filter((p) => !String(p.certificate_number ?? "").trim());
  const pick = (ps: any[], how: string) => {
    const f = free(ps);
    if (f.length === 1) return { policy: f[0], how };
    if (ps.length === 1) return { policy: ps[0], how };
    return null;
  };

  const rfc10 = row.rfc.slice(0, 10);
  // Mismo RFC/CURP base, pero exige que coincida el nombre de pila (dos hermanos pueden compartir los 10 primeros caracteres).
  const givenOk = (p: any) => nameScore(row.name, String(p.clients?.first_name ?? "")) >= 1;
  const byId = pols.filter((p) => idPrefix(p) === rfc10 && givenOk(p));
  const r1 = byId.length ? pick(byId.length > 1 ? byId.filter(nameOk) : byId, "RFC / CURP") : null;
  if (r1) return r1;

  const key = tokenKey(row.name);
  const byName = pols.filter((p) => tokenKey(clientName(p)) === key);
  const r2 = byName.length ? pick(byName, "Nombre completo") : null;
  if (r2) return r2;

  const d = rfcDate(row.rfc);
  const byDob = pols.filter((p) => d && dobKey(p.clients?.date_of_birth) === d && nameOk(p) && givenOk(p));
  const r3 = byDob.length ? pick(byDob, "Nombre y fecha de nacimiento") : null;
  if (r3) return r3;

  const options = [...new Set([...byId, ...byName, ...byDob, ...pols.filter((p) => nameScore(row.name, clientName(p)) >= 3)])];
  return options.length ? { options } : {};
}


/**
 * Empareja toda la relación: primero los que ya tienen el mismo número de certificado (para que nadie "robe" el
 * certificado de otro), luego el resto por RFC/CURP, nombre o fecha de nacimiento.
 */
export function matchAll(rows: InsurerRow[], active: any[]) {
  const used = new Set<string>();
  const out = new Map<InsurerRow, { policy?: any; how?: string; options?: any[] }>();
  for (const row of rows) {
    const same = active.filter((p) => !used.has(p.id) && String(p.certificate_number ?? "") === row.certificate_number && nameScore(row.name, clientName(p)) >= 2);
    if (same.length === 1) { used.add(same[0].id); out.set(row, { policy: same[0], how: "Mismo número" }); }
  }
  for (const row of rows) {
    if (out.has(row)) continue;
    const r = matchRow(row, active.filter((p) => !used.has(p.id)));
    if (r.policy) used.add(r.policy.id);
    out.set(row, r);
  }
  return out;
}
