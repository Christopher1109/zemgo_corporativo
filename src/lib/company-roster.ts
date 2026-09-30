// Lectura y conciliación del listado mensual que manda una empresa (quién sigue, altas y bajas).
// Formato confirmado por la empresa (Transportes Bueno, sep-2026):
//  - Hoja principal con encabezados: No EMPLEADO, NOMBRE, APELLIDO PATERNO, APELLIDO MATERNO, SEXO,
//    PARENTESCO, FECHA NACIMIENTO, EDAD, CURP, DIRECCION, COLONIA, CP (el orden puede variar).
//  - Opcional: una hoja con secciones "BAJAS" y "ALTAS" (sin encabezados), mismas columnas que el concentrado.

export type RosterPerson = {
  row: number;
  employee_number: number | null;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | null;
  relationship: string; // T = titular
  date_of_birth: string | null;
  curp: string;
  street: string | null;
  colonia: string | null;
  zip: string | null;
  dependents: RosterPerson[];
  alerts: { field: string; message: string; level: "warning"; source: string }[];
  /** true si la persona viene en la sección ALTAS de la hoja de movimientos. */
  reported_alta?: boolean;
};

export type RosterFile = {
  people: RosterPerson[];
  bajas: { name: string; curp: string }[];
  altas: { name: string; curp: string }[];
  warnings: string[];
};

const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const ID_TOKEN_RE = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,9})\b/;

export const normName = (s: string) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const normKey = (s: string) => normName(s).replace(/ /g, "");

function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "text" in v) return String(v.text ?? "");
  if (typeof v === "object" && "result" in v) return cellText(v.result);
  if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((r) => r.text).join("");
  return String(v).replace(/\s+/g, " ").trim();
}

function toIsoDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const ALIASES: Record<string, string[]> = {
  employee_number: ["noempleado", "numeroempleado", "numerodeempleado", "empleado", "noemp", "numempleado"],
  first_name: ["nombre", "nombres", "nombres"],
  last_name_p: ["apellidopaterno", "paterno"],
  last_name_m: ["apellidomaterno", "materno"],
  last_name: ["apellidos"],
  gender: ["sexo", "genero"],
  relationship: ["parentesco"],
  date_of_birth: ["fechanacimiento", "fechadenacimiento", "nacimiento"],
  curp: ["curp"],
  street: ["direccion", "domicilio", "calle"],
  colonia: ["colonia"],
  zip: ["cp", "codigopostal"],
};

const isTitular = (p: string) => !p || /^T(ITULAR)?$/.test(normKey(p)) || normKey(p) === "EMPLEADO";
function relLabel(p: string) {
  const k = normKey(p);
  if (/ESPOS|CONYUG|^C$/.test(k)) return "Cónyuge";
  if (/HIJ|^H$/.test(k)) return "Hijo(a)";
  if (/PADRE/.test(k)) return "Padre";
  if (/MADRE/.test(k)) return "Madre";
  return p || "Dependiente";
}
function genderOf(sexo: string, curp: string): "M" | "F" | null {
  if (CURP_RE.test(curp)) return curp[10] === "H" ? "M" : "F";
  const k = normKey(sexo);
  if (k === "H" || k.startsWith("HOMBRE") || k.startsWith("MASC")) return "M";
  if (k.startsWith("MUJER") || k.startsWith("FEM") || k === "F") return "F";
  if (k === "M") return null; // ambiguo (M = Masculino o Mujer): se toma de la CURP si es válida
  return null;
}

export function alertsFor(curp: string, dob: string | null, source: string) {
  const out: RosterPerson["alerts"] = [];
  if (!CURP_RE.test(curp)) {
    out.push({ field: "curp", level: "warning", source, message: "CURP posiblemente equivocada: formato inválido en el listado de la empresa. Verificar con el asegurado." });
  } else if (dob && curp.slice(4, 10) !== dob.replace(/-/g, "").slice(2)) {
    out.push({ field: "curp", level: "warning", source, message: "CURP posiblemente equivocada: la fecha dentro de la CURP no coincide con la fecha de nacimiento del listado." });
  }
  return out;
}

export async function parseRosterFile(file: File, source: string): Promise<RosterFile> {
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const warnings: string[] = [];
  const people: RosterPerson[] = [];
  const bajas: { name: string; curp: string }[] = [];
  const altas: { name: string; curp: string }[] = [];

  for (const ws of wb.worksheets) {
    // 1) ¿Hoja con encabezados (listado completo)?
    let headerRow = 0;
    const col: Record<string, number> = {};
    for (let i = 1; i <= Math.min(ws.rowCount, 40) && !headerRow; i++) {
      const found: Record<string, number> = {};
      ws.getRow(i).eachCell((cell: any, c: number) => {
        const k = normKey(cellText(cell.value)).toLowerCase();
        for (const [f, al] of Object.entries(ALIASES)) if (found[f] == null && al.includes(k)) found[f] = c;
      });
      if (found.curp != null && found.first_name != null) { headerRow = i; Object.assign(col, found); }
    }

    if (headerRow) {
      let lastTitular: RosterPerson | null = null;
      for (let i = headerRow + 1; i <= ws.rowCount; i++) {
        const r = ws.getRow(i);
        const v = (f: string) => (col[f] ? r.getCell(col[f]).value : null);
        const t = (f: string) => cellText(v(f));
        const first = t("first_name");
        const last = col.last_name ? t("last_name") : [t("last_name_p"), t("last_name_m")].filter(Boolean).join(" ");
        const curp = t("curp").toUpperCase().replace(/\s+/g, "");
        if (!first && !last && !curp) continue;
        // Encabezados combinados en 2 filas: la segunda repite los títulos.
        if (normKey(curp) === "CURP" || ALIASES.first_name.includes(normKey(first).toLowerCase())) continue;
        const empRaw = t("employee_number");
        const dob = toIsoDate(v("date_of_birth"));
        const person: RosterPerson = {
          row: i,
          employee_number: empRaw && /^\d+$/.test(empRaw) ? Number(empRaw) : null,
          first_name: normName(first),
          last_name: normName(last),
          gender: genderOf(t("gender"), curp),
          relationship: t("relationship"),
          date_of_birth: dob,
          curp,
          street: t("street") || null,
          colonia: t("colonia") || null,
          zip: t("zip") ? t("zip").padStart(5, "0") : null,
          dependents: [],
          alerts: alertsFor(curp, dob, source),
        };
        if (!isTitular(person.relationship) && person.employee_number == null && lastTitular) {
          person.relationship = relLabel(person.relationship);
          lastTitular.dependents.push(person);
        } else {
          people.push(person);
          lastTitular = person;
        }
      }
      continue;
    }

    // 2) ¿Hoja de movimientos con secciones BAJAS / ALTAS (sin encabezados)?
    let section: "bajas" | "altas" | null = null;
    for (let i = 1; i <= ws.rowCount; i++) {
      const vals: string[] = [];
      ws.getRow(i).eachCell({ includeEmpty: true }, (cell: any) => vals.push(cellText(cell.value)));
      // Las celdas combinadas repiten el mismo valor en cada columna: se deduplican.
      const joined = normName([...new Set(vals.filter(Boolean))].join(" "));
      if (/^BAJAS?$/.test(joined)) { section = "bajas"; continue; }
      if (/^ALTAS?$/.test(joined)) { section = "altas"; continue; }
      if (!section || !joined) continue;
      const token = vals.map((x) => x.toUpperCase().replace(/\s+/g, "")).find((x) => ID_TOKEN_RE.test(x) && x.length >= 10) ?? "";
      const nameParts = vals.filter((x) => x && /^[A-Za-zÁÉÍÓÚÑáéíóúñ .]+$/.test(x) && x.length > 1 && !/^[HMT]$/i.test(x.trim()));
      (section === "bajas" ? bajas : altas).push({ name: normName(nameParts.slice(0, 3).join(" ")), curp: token });
    }
  }

  if (people.length === 0) warnings.push("No se encontró una hoja con encabezados CURP y NOMBRE.");

  // Altas reportadas: se marcan en el listado; si alguna no viene en el concentrado, se avisa.
  const key = (s: string) => normName(s).split(" ").sort().join(" ");
  for (const a of altas) {
    const hit = people.find((p) => (a.curp && p.curp === a.curp) || key(`${p.first_name} ${p.last_name}`) === key(a.name));
    if (hit) hit.reported_alta = true;
    else warnings.push(`La hoja de altas reporta a ${a.name || a.curp} pero no viene en el listado concentrado.`);
  }
  return { people, bajas, altas, warnings };
}

// ---------------------------------------------------------------- Conciliación

export type CurrentInsured = {
  client_id: string; first_name: string; last_name: string; curp: string | null; rfc: string | null;
  employee_number: number | null; policy_status: string; certificate_number: string | null;
};

export type Reconciliation = {
  siguen: { person: RosterPerson; current: CurrentInsured }[];
  nuevos: RosterPerson[];
  bajas: { current: CurrentInsured; reason: string; explicit: boolean }[];
};

const idKey = (c: { curp?: string | null; rfc?: string | null }) =>
  String(c.curp ?? "").replace(/^SIN-CURP-/, "").toUpperCase().slice(0, 10) || String(c.rfc ?? "").toUpperCase().slice(0, 10);

export function reconcile(file: RosterFile, current: CurrentInsured[]): Reconciliation {
  const active = current.filter((c) => c.policy_status !== "cancelled");
  const byCurp = new Map(active.filter((c) => c.curp).map((c) => [c.curp!.toUpperCase(), c]));
  const byKey = new Map<string, CurrentInsured[]>();
  const byName = new Map<string, CurrentInsured[]>();
  for (const c of active) {
    const k = idKey(c);
    if (k.length === 10) byKey.set(k, [...(byKey.get(k) ?? []), c]);
    const n = normName(`${c.first_name} ${c.last_name}`).split(" ").sort().join(" ");
    byName.set(n, [...(byName.get(n) ?? []), c]);
  }
  const used = new Set<string>();
  const find = (p: { curp: string; first_name?: string; last_name?: string; name?: string }) => {
    const exact = byCurp.get(p.curp);
    if (exact && !used.has(exact.client_id)) return exact;
    const n = normName(p.name ?? `${p.first_name} ${p.last_name}`).split(" ").sort().join(" ");
    const k = p.curp.slice(0, 10);
    // Sin CURP exacta se exige que coincida al menos un nombre de pila (evita confundir DANIEL con DAVID).
    const given = normName(p.first_name ?? (p.name ?? "").split(" ")[0] ?? "").split(" ").filter(Boolean);
    const sameGiven = (c: CurrentInsured) => {
      const t = new Set(normName(`${c.first_name} ${c.last_name}`).split(" "));
      return given.some((g) => t.has(g));
    };
    const cands = (byKey.get(k) ?? []).filter((c) => !used.has(c.client_id) && sameGiven(c));
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) {
      const byN = cands.find((c) => normName(`${c.first_name} ${c.last_name}`).split(" ").sort().join(" ") === n);
      if (byN) return byN;
    }
    const nm = (byName.get(n) ?? []).filter((c) => !used.has(c.client_id));
    return nm.length === 1 ? nm[0] : null;
  };

  const out: Reconciliation = { siguen: [], nuevos: [], bajas: [] };
  // Bajas explícitas primero (para que no se confundan con "siguen").
  const explicitBaja = new Set<string>();
  for (const b of file.bajas) {
    const c = find({ curp: b.curp, name: b.name });
    if (c) { used.add(c.client_id); explicitBaja.add(c.client_id); out.bajas.push({ current: c, reason: "Reportada en la hoja de bajas", explicit: true }); }
  }
  for (const p of file.people) {
    const c = find(p);
    if (c && explicitBaja.has(c.client_id)) continue;
    if (c) { used.add(c.client_id); out.siguen.push({ person: p, current: c }); }
    else out.nuevos.push(p);
  }
  for (const c of active) {
    if (!used.has(c.client_id)) out.bajas.push({ current: c, reason: "Ya no aparece en el listado de la empresa", explicit: false });
  }
  return out;
}
