// Lectura y conciliación del listado mensual que manda una empresa (quién sigue, altas y bajas).
// Formato confirmado por la empresa (Transportes Bueno, sep-2026):
//  - Hoja principal con encabezados: No EMPLEADO, NOMBRE, APELLIDO PATERNO, APELLIDO MATERNO, SEXO,
//    PARENTESCO, FECHA NACIMIENTO, EDAD, CURP, DIRECCION, COLONIA, CP (el orden puede variar).
//  - Opcional: hojas con secciones "BAJAS" y "ALTAS" (sin encabezados), mismas columnas que el concentrado.
//    La empresa suele mandar el historial completo (una hoja por mes, p. ej. "ALTAS Y BAJAS OCTUBRE 26",
//    "ALTAS Y BAJAS SEPTIEMBRE 2026", "ALTAS Y BAJAS OCTUBRE " = año anterior). Solo se usa la hoja del mes
//    elegido en "Mes del listado"; las demás se ignoran para no aplicar bajas/altas de otros meses.

export type RosterPerson = {
  row: number;
  employee_number: number | null;
  first_name: string;
  last_name: string;
  /** Apellidos por separado (los pide HIR en sus archivos de altas/bajas). */
  paterno: string;
  materno: string;
  gender: "M" | "F" | null;
  relationship: string; // T = titular
  date_of_birth: string | null;
  curp: string;
  street: string | null;
  colonia: string | null;
  zip: string | null;
  dependents: RosterPerson[];
  alerts: { field: string; message: string; level: "warning"; source: string }[];
  /** true si la persona viene en la sección ALTAS de la hoja de movimientos del mes. */
  reported_alta?: boolean;
  /** Se llena al conciliar: el "nuevo" parece ser alguien que ya está o estuvo en el sistema. */
  review?: { kind: "duplicado" | "reingreso"; message: string };
};

export type RosterFile = {
  people: RosterPerson[];
  bajas: { name: string; curp: string }[];
  altas: { name: string; curp: string }[];
  warnings: string[];
  /** Hoja de movimientos que se usó (la del mes elegido) y cuántas se ignoraron. */
  movements_sheet: string | null;
  ignored_sheets: string[];
};

const MONTHS: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

/** Mes y año (si viene) en el nombre de la hoja: "ALTAS Y BAJAS OCTUBRE 26" → {month: 10, year: 2026}. */
export function sheetPeriod(name: string): { month: number | null; year: number | null } {
  const toks = normName(name).split(" ");
  let month: number | null = null, year: number | null = null;
  for (const t of toks) {
    if (MONTHS[t]) month = MONTHS[t];
    else if (/^\d{4}$/.test(t)) year = Number(t);
    else if (/^\d{2}$/.test(t)) year = 2000 + Number(t);
  }
  return { month, year };
}

/** Año/mes de cada hoja. Las que no traen año lo heredan de sus vecinas: la empresa ordena las hojas de la
 *  más reciente a la más antigua, así que al bajar por el libro, si el mes "sube", se cambió de año
 *  (… FEBRERO, ENERO, DICIEMBRE ← año anterior). Si ninguna hoja trae año, queda en null. */
export function inferSheetPeriods(names: string[]): { month: number | null; year: number | null }[] {
  const out = names.map((n) => sheetPeriod(n));
  const first = out.findIndex((p) => p.month != null && p.year != null);
  if (first < 0) return out;
  let prev = out[first];
  for (let i = first + 1; i < out.length; i++) {
    const p = out[i];
    if (p.month == null) continue;
    if (p.year == null) p.year = p.month < prev.month! ? prev.year : prev.year! - 1;
    prev = p;
  }
  let next = out[first];
  for (let i = first - 1; i >= 0; i--) {
    const p = out[i];
    if (p.month == null) continue;
    if (p.year == null) p.year = p.month > next.month! ? next.year : next.year! + 1;
    next = p;
  }
  return out;
}

/** Índice de la hoja de movimientos del periodo (YYYY-MM), o -1 si no hay. Si ninguna hoja trae año
 *  (no se puede deducir), se toma la primera de ese mes y `ambiguous` avisa si había más de una. */
export function pickMovementSheet(names: string[], period: string): { index: number; ambiguous: boolean } {
  const [y, m] = period.split("-").map(Number);
  const per = inferSheetPeriods(names);
  const exact = per.findIndex((p) => p.month === m && p.year === y);
  if (exact >= 0) return { index: exact, ambiguous: false };
  const unknown = per.map((p, i) => (p.month === m && p.year == null ? i : -1)).filter((i) => i >= 0);
  return { index: unknown[0] ?? -1, ambiguous: unknown.length > 1 };
}

const nameKey = (s: string) => normName(s).split(" ").filter(Boolean).sort().join(" ");

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

export async function parseRosterFile(file: File, source: string, period?: string): Promise<RosterFile> {
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const warnings: string[] = [];
  const people: RosterPerson[] = [];
  const otherSheets: string[] = []; // hojas sin encabezados, en el orden del libro (incluye las vacías)
  const movements: { idx: number; sheet: string; bajas: { name: string; curp: string }[]; altas: { name: string; curp: string }[] }[] = [];

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
          paterno: col.last_name ? "" : normName(t("last_name_p")),
          materno: col.last_name ? "" : normName(t("last_name_m")),
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
    otherSheets.push(String(ws.name ?? "").trim());
    let section: "bajas" | "altas" | null = null;
    const mv = { idx: otherSheets.length - 1, sheet: String(ws.name ?? "").trim(), bajas: [] as { name: string; curp: string }[], altas: [] as { name: string; curp: string }[] };
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
      (section === "bajas" ? mv.bajas : mv.altas).push({ name: normName(nameParts.slice(0, 3).join(" ")), curp: token });
    }
    if (mv.bajas.length || mv.altas.length) movements.push(mv);
  }

  // Solo cuenta la hoja de movimientos del mes elegido. Sin periodo (uso antiguo) y con una sola hoja, se usa ésa.
  let chosen: (typeof movements)[number] | null = null;
  if (period) {
    const pick = pickMovementSheet(otherSheets, period);
    const name = pick.index >= 0 ? otherSheets[pick.index] : null;
    chosen = movements.find((m) => m.idx === pick.index) ?? null;
    if (pick.ambiguous) {
      warnings.push(`Hay varias hojas de ese mes sin año; se usó «${name}» (la primera del archivo). Verifica que sea la de ${period}.`);
    }
    if (name && !chosen) {
      warnings.push(`La hoja «${name}» no trae altas ni bajas. Solo se usa el listado concentrado.`);
    } else if (!name && movements.length) {
      warnings.push(`No hay hoja de altas y bajas para ${period} (la más reciente en el archivo es «${movements[0].sheet}»). Solo se usa el listado concentrado.`);
    }
  } else if (movements.length === 1) {
    chosen = movements[0];
  }
  const bajas = chosen?.bajas ?? [];
  const altas = chosen?.altas ?? [];
  const ignored_sheets = movements.filter((m) => m !== chosen).map((m) => m.sheet);

  // Misma persona dos veces en el concentrado (misma fecha de nacimiento y mismos nombres, aunque cambie
  // el orden de apellidos, la CURP o el No. de empleado).
  const all = people.flatMap((p) => [p, ...p.dependents]);
  const groups = new Map<string, RosterPerson[]>();
  for (const p of all) {
    if (!p.date_of_birth) continue;
    const k = `${p.date_of_birth}|${nameKey(`${p.first_name} ${p.last_name}`)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const desc = g.map((p) => `fila ${p.row}${p.employee_number != null ? ` (Emp. ${p.employee_number}, ${p.curp})` : ` (${p.curp})`}`).join(" y ");
    warnings.push(`${g[0].first_name} ${g[0].last_name} viene ${g.length} veces en el listado: ${desc}.`);
    for (const p of g) p.alerts.push({ field: "duplicado", level: "warning", source, message: `Viene repetido en el listado de la empresa: ${desc}. Confirmar cuál registro es el bueno.` });
  }

  if (people.length === 0) warnings.push("No se encontró una hoja con encabezados CURP y NOMBRE.");

  // Altas reportadas: se marcan en el listado; si alguna no viene en el concentrado, se avisa.
  for (const a of altas) {
    // CURP exacta primero; por nombre se marcan todos los que coincidan (p. ej. registros repetidos).
    const byCurp = people.filter((p) => a.curp && p.curp === a.curp);
    const hits = byCurp.length ? byCurp : people.filter((p) => nameKey(`${p.first_name} ${p.last_name}`) === nameKey(a.name));
    for (const h of hits) h.reported_alta = true;
    if (!hits.length) warnings.push(`La hoja de altas reporta a ${a.name || a.curp} pero no viene en el listado concentrado.`);
  }
  return { people, bajas, altas, warnings, movements_sheet: chosen?.sheet ?? null, ignored_sheets };
}

// ---------------------------------------------------------------- Conciliación

export type CurrentInsured = {
  client_id: string; first_name: string; last_name: string; curp: string | null; rfc: string | null;
  employee_number: number | null; policy_status: string; certificate_number: string | null;
  date_of_birth?: string | null;
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

  // ¿Algún "nuevo" ya está (o estuvo) en el sistema con otra CURP / otro orden de apellidos?
  // Misma fecha de nacimiento + mismos nombres = probablemente la misma persona.
  const sameDob = (a?: string | null, b?: string | null) => !!a && !!b && a.slice(0, 10) === b.slice(0, 10);
  for (const p of out.nuevos) {
    const n = nameKey(`${p.first_name} ${p.last_name}`);
    const twin = current.find((c) =>
      (p.curp && c.curp?.toUpperCase() === p.curp) ||
      (nameKey(`${c.first_name} ${c.last_name}`) === n && (sameDob(c.date_of_birth, p.date_of_birth) || !c.date_of_birth || !p.date_of_birth)));
    if (!twin) continue;
    const who = `${twin.first_name} ${twin.last_name}`.trim() + (twin.employee_number != null ? ` (Emp. ${twin.employee_number})` : "");
    if (twin.policy_status !== "cancelled") {
      p.review = { kind: "duplicado", message: `Parece ser ${who}, que ya está activo en el sistema${twin.curp && twin.curp !== p.curp ? ` con CURP ${twin.curp}` : ""}. Si es la misma persona, no lo des de alta otra vez: corrige sus datos.` };
    } else {
      p.review = { kind: "reingreso", message: p.reported_alta
        ? `Reingreso: ${who} ya estuvo asegurado y se dio de baja; la empresa lo reporta como alta este mes.`
        : `${who} ya estuvo asegurado y se dio de baja, y no viene en la hoja de altas de este mes. Confirmar con la empresa si regresó.` };
    }
  }

  for (const c of active) {
    if (!used.has(c.client_id)) out.bajas.push({ current: c, reason: "Ya no aparece en el listado de la empresa", explicit: false });
  }
  return out;
}
