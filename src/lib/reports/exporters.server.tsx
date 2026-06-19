// Server-only exporters: CSV / XLSX / PDF builders + storage upload.
import type { ColumnSpec, ReportFilters, ReportSpec } from "./types";
import { renderPdfToBytes } from "@/lib/pdf/render";
import { ReportTablePdf } from "@/lib/pdf/templates/ReportTable";

type Kpi = { label: string; value: string };

function fmtCell(value: any, col: ColumnSpec): string {
  if (value == null) return "";
  if (col.format === "money") return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  if (col.format === "int") return String(Math.trunc(Number(value)));
  if (col.format === "percent") return `${Number(value).toFixed(1)}%`;
  if (col.format === "date" && typeof value === "string") return value.slice(0, 10);
  if (col.format === "datetime" && typeof value === "string") return new Date(value).toLocaleString("es-MX");
  return String(value);
}

export function toCSV(spec: ReportSpec, rows: any[]): Uint8Array {
  const header = spec.columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const body = rows.map((r) =>
    spec.columns.map((c) => `"${String(fmtCell(r[c.key], c)).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const csv = "\ufeff" + header + "\n" + body;
  return new TextEncoder().encode(csv);
}

export async function toXLSX(spec: ReportSpec, rows: any[], filters: ReportFilters, by: string, kpis?: Kpi[]): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "HOPE Consulting"; wb.created = new Date();
  const ws = wb.addWorksheet(spec.name.slice(0, 28));

  ws.mergeCells(1, 1, 1, spec.columns.length);
  const title = ws.getCell(1, 1); title.value = spec.name;
  title.font = { size: 16, bold: true }; ws.getRow(1).height = 22;

  const filterLine = Object.entries(filters)
    .filter(([, v]) => v != null && v !== "" && v !== "all" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length + " sel." : v}`).join("  ·  ") || "Sin filtros aplicados";
  ws.mergeCells(2, 1, 2, spec.columns.length);
  ws.getCell(2, 1).value = filterLine;
  ws.getCell(2, 1).font = { italic: true, color: { argb: "FF666666" } };

  ws.mergeCells(3, 1, 3, spec.columns.length);
  ws.getCell(3, 1).value = `Generado por ${by} · ${new Date().toLocaleString("es-MX")} · ${rows.length} registros`;
  ws.getCell(3, 1).font = { size: 9, color: { argb: "FF888888" } };

  let cursor = 4;
  if (kpis?.length) {
    ws.mergeCells(cursor, 1, cursor, spec.columns.length);
    ws.getCell(cursor, 1).value = kpis.map(k => `${k.label}: ${k.value}`).join("    ·    ");
    ws.getCell(cursor, 1).font = { bold: true, color: { argb: "FF1F2937" } };
    ws.getCell(cursor, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    cursor += 1;
  }

  const headerRow = ws.getRow(cursor); cursor += 1;
  spec.columns.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label; });
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle" };
  });

  spec.columns.forEach((c, i) => { ws.getColumn(i + 1).width = (c.width ?? 16); });

  rows.forEach((r) => {
    const row = ws.getRow(cursor); cursor += 1;
    spec.columns.forEach((c, i) => {
      const v = r[c.key];
      const cell = row.getCell(i + 1);
      if (c.format === "money") { cell.value = Number(v ?? 0); cell.numFmt = '"$"#,##0'; }
      else if (c.format === "date" && v) { cell.value = new Date(v as any); cell.numFmt = "yyyy-mm-dd"; }
      else if (c.format === "datetime" && v) { cell.value = new Date(v as any); cell.numFmt = "yyyy-mm-dd hh:mm"; }
      else if (c.format === "percent") { cell.value = Number(v ?? 0) / 100; cell.numFmt = "0.0%"; }
      else cell.value = v ?? "";
      if (c.align === "right") cell.alignment = { horizontal: "right" };
    });
  });

  if (spec.totals?.length) {
    const totals: any = {};
    spec.totals.forEach((k) => { totals[k] = rows.reduce((s, r) => s + Number(r[k] ?? 0), 0); });
    const row = ws.getRow(cursor); cursor += 1;
    spec.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (i === 0) cell.value = "TOTAL";
      else if (c.key in totals) cell.value = totals[c.key];
      if (c.format === "money") cell.numFmt = '"$"#,##0';
    });
    row.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function toPDF(spec: ReportSpec, rows: any[], filters: ReportFilters, by: string, kpis?: Kpi[]): Promise<Uint8Array> {
  return await renderPdfToBytes(<ReportTablePdf spec={spec} rows={rows} filters={filters} generatedBy={by} kpis={kpis} />);
}

export async function uploadReport(
  userId: string, reportCode: string, ext: "csv" | "xlsx" | "pdf", bytes: Uint8Array,
): Promise<{ path: string; signedUrl: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const path = `${reportCode}/${userId}/${stamp}.${ext}`;
  const contentType =
    ext === "csv" ? "text/csv; charset=utf-8" :
    ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    "application/pdf";
  const { error: upErr } = await supabaseAdmin.storage.from("reports").upload(path, bytes, { contentType, upsert: false });
  if (upErr) throw upErr;
  const { data: signed, error: sErr } = await supabaseAdmin.storage.from("reports").createSignedUrl(path, 60 * 60 * 24);
  if (sErr) throw sErr;
  return { path, signedUrl: signed.signedUrl };
}
