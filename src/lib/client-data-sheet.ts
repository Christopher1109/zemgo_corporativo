// Excel "Datos de clientes": download (well formatted) and re-upload to update client records.
import { supabase } from "@/integrations/supabase/client";
import { fetchProgramClients, newWorkbook, downloadWorkbook, GENDER_LABEL, MARITAL_LABEL, fullName, slugDate } from "@/lib/client-excel";

const COLS = [
  { key: "id", header: "ID sistema (no modificar)", width: 12 },
  { key: "name", header: "Nombre completo", width: 34 },
  { key: "curp", header: "CURP", width: 22, editable: true },
  { key: "rfc", header: "RFC", width: 16, editable: true },
  { key: "dob", header: "Fecha de nacimiento (dd/mm/aaaa)", width: 18, editable: true },
  { key: "gender", header: "Género", width: 13, editable: true },
  { key: "marital", header: "Estado civil", width: 15, editable: true },
  { key: "phone", header: "Teléfono", width: 15, editable: true },
  { key: "email", header: "Email", width: 30, editable: true },
  { key: "rep", header: "Vendedor asignado", width: 24 },
  { key: "bought", header: "Fecha de compra (primer pago)", width: 18 },
  { key: "next", header: "Próximo pago", width: 15 },
  { key: "cert", header: "Certificado", width: 14 },
  { key: "missing", header: "Datos faltantes", width: 40 },
] as const;
const REQUIRED = ["name", "curp", "rfc", "dob", "gender", "phone", "email"];
const HEADER_ROW = 4;
const NAVY = "FF0F2A4A", YELLOW = "FFFDE68A", EDIT = "FFEFF6FF", LOCK = "FFF3F4F6";

const fmt = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}/${y}` : "";
};
const validCurp = (c: string) => /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(c);

export async function downloadClientDataSheet(program: { id: string; code: string; name: string }) {
  const clients = await fetchProgramClients(program.id, true);
  const today = new Date().toISOString().slice(0, 10);
  const rows = clients.map((c: any) => {
    const pays = (c.policies ?? []).flatMap((p: any) => p.payments ?? []);
    const paid = pays.filter((p: any) => p.status === "paid" && p.paid_at).map((p: any) => p.paid_at).sort();
    const starts = (c.policies ?? []).map((p: any) => p.start_date).filter(Boolean).sort();
    const next = pays.filter((p: any) => ["pending", "overdue"].includes(p.status) && p.due_date).map((p: any) => p.due_date).sort();
    const certs = (c.policies ?? []).map((p: any) => p.certificate_number).filter(Boolean);
    const curp = (c.curp ?? "").startsWith("SIN-CURP") ? "" : c.curp ?? "";
    const v: Record<string, string> = {
      id: c.id, name: fullName(c), curp, rfc: c.rfc ?? "", dob: fmt(c.date_of_birth),
      gender: c.gender ? GENDER_LABEL[c.gender] ?? c.gender : "",
      marital: c.marital_status ? MARITAL_LABEL[c.marital_status] ?? c.marital_status : "",
      phone: c.phone ?? "", email: c.email ?? "",
      rep: c.sales_reps?.full_name ?? "Despacho",
      bought: fmt(paid[0] ?? starts[0]) || "Sin pago",
      next: fmt(next.find((d: string) => d >= today) ?? next[0]) || "—",
      cert: certs.length ? certs.map((n: string) => `N° ${n}`).join(", ") : "Sin certificado",
    };
    const labels = COLS.filter((x) => REQUIRED.includes(x.key) && !v[x.key]).map((x) => x.header.replace(/ \(.*\)/, ""));
    v.missing = labels.length ? labels.join(", ") : "Completo";
    return { v, n: labels.length };
  }).sort((a, b) => b.n - a.n || a.v.name.localeCompare(b.v.name));

  const wb = await newWorkbook();
  const ws = wb.addWorksheet("Datos de clientes", { views: [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 2 }] });
  ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }));
  const last = String.fromCharCode(64 + COLS.length);
  ws.mergeCells(`A1:${last}1`);
  Object.assign(ws.getCell("A1"), { value: `Datos de clientes — ${program.name}` });
  ws.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: NAVY } };
  ws.mergeCells(`A2:${last}2`);
  ws.getCell("A2").value = `Generado el ${fmt(today)} · ${rows.length} clientes · Complete las celdas amarillas en las columnas azules y regrese este mismo archivo para subirlo al sistema.`;
  ws.getCell("A2").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF4B5563" } };
  ws.getRow(1).height = 26;

  const h = ws.getRow(HEADER_ROW);
  COLS.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "editable" in c ? "FF1D4ED8" : NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  h.height = 34;
  ws.getCell(`A${HEADER_ROW - 1}`).value = "Columnas azules: editables · Columnas oscuras: solo consulta · Amarillo: dato faltante";
  ws.getCell(`A${HEADER_ROW - 1}`).font = { name: "Arial", size: 9, bold: true, color: { argb: "FF1D4ED8" } };

  const border = { style: "thin", color: { argb: "FFE5E7EB" } } as const;
  rows.forEach(({ v }, idx) => {
    const r = ws.getRow(HEADER_ROW + 1 + idx);
    COLS.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v[c.key];
      cell.font = { name: "Arial", size: 10, color: { argb: c.key === "id" ? "FF9CA3AF" : "FF111827" }, bold: c.key === "name" };
      cell.border = { top: border, bottom: border, left: border, right: border };
      cell.alignment = { vertical: "middle", wrapText: c.key === "missing" };
      const empty = REQUIRED.includes(c.key) && !v[c.key];
      const bg = empty ? YELLOW : "editable" in c ? EDIT : LOCK;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      if (c.key === "missing") cell.font = { name: "Arial", size: 9, color: { argb: v.missing === "Completo" ? "FF047857" : "FFB45309" }, bold: true };
      if (c.key === "gender") cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"Masculino,Femenino"'] };
      if (c.key === "marital") cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${Object.values(MARITAL_LABEL).join(",")}"`] };
    });
    r.height = 20;
  });
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: COLS.length } };
  await downloadWorkbook(wb, `datos-clientes-${program.code}-${slugDate()}.xlsx`);
}

function text(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((t: any) => t.text).join("") ?? "").trim();
  return String(v).trim();
}
function toIsoDate(s: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const GENDER_IN: Record<string, string> = { MASCULINO: "M", HOMBRE: "M", H: "M", M: "M", FEMENINO: "F", MUJER: "F", F: "F" };
const MARITAL_IN = Object.fromEntries(Object.entries(MARITAL_LABEL).map(([k, v]) => [v.toUpperCase().replace(/\(A\)/, "").trim(), k]));

export type SheetChange = { id: string; name: string; changes: Record<string, { from: any; to: any }> };

export async function parseClientDataSheet(file: File, programId: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  let hRow = 0; const idx: Record<string, number> = {};
  ws.eachRow((row, n) => {
    if (hRow) return;
    const vals = (row.values as any[]).map(text);
    if (vals.some((v) => v.startsWith("ID sistema"))) {
      hRow = n;
      COLS.forEach((c) => { const i = vals.findIndex((v) => v === c.header); if (i > 0) idx[c.key] = i; });
    }
  });
  if (!hRow) throw new Error("El archivo no tiene el formato de 'Datos de clientes'. Descárgalo primero desde el sistema.");
  const current = new Map((await fetchProgramClients(programId)).map((c: any) => [c.id, c]));
  const changes: SheetChange[] = []; const errors: string[] = [];
  ws.eachRow((row, n) => {
    if (n <= hRow) return;
    const get = (k: string) => (idx[k] ? text(row.getCell(idx[k]).value) : "");
    const id = get("id"); if (!id) return;
    const c: any = current.get(id);
    if (!c) { errors.push(`Renglón ${n}: cliente no encontrado en este programa`); return; }
    const next: Record<string, any> = {};
    const curp = get("curp").toUpperCase().replace(/\s/g, "");
    if (curp && curp !== c.curp) { if (validCurp(curp)) next.curp = curp; else errors.push(`Renglón ${n}: CURP inválido (${curp})`); }
    const rfc = get("rfc").toUpperCase().replace(/\s/g, "");
    if (rfc && rfc !== (c.rfc ?? "")) next.rfc = rfc;
    const dobRaw = get("dob");
    if (dobRaw) { const d = toIsoDate(dobRaw); if (!d) errors.push(`Renglón ${n}: fecha inválida (${dobRaw})`); else if (d !== c.date_of_birth) next.date_of_birth = d; }
    const g = GENDER_IN[get("gender").toUpperCase()];
    if (g && g !== c.gender) next.gender = g;
    const ms = MARITAL_IN[get("marital").toUpperCase().replace(/\(A\)/, "").trim()];
    if (ms && ms !== c.marital_status) next.marital_status = ms;
    const phone = get("phone").replace(/[^\d+]/g, "");
    if (phone && phone !== (c.phone ?? "")) next.phone = phone;
    const email = get("email").toLowerCase();
    if (email && email !== (c.email ?? "").toLowerCase()) { if (/^\S+@\S+\.\S+$/.test(email)) next.email = email; else errors.push(`Renglón ${n}: email inválido (${email})`); }
    const keys = Object.keys(next);
    if (keys.length) changes.push({ id, name: fullName(c), changes: Object.fromEntries(keys.map((k) => [k, { from: c[k] ?? "", to: next[k] }])) });
  });
  return { changes, errors };
}

export async function applyClientDataChanges(changes: SheetChange[]) {
  let ok = 0; const failed: string[] = [];
  for (const ch of changes) {
    const payload = Object.fromEntries(Object.entries(ch.changes).map(([k, v]) => [k, v.to]));
    const { error } = await supabase.from("clients").update(payload as any).eq("id", ch.id);
    if (error) failed.push(`${ch.name}: ${error.message}`); else ok++;
  }
  return { ok, failed };
}
