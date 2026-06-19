// Generic landscape PDF table with optional KPI banner.
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ColumnSpec, ReportFilters, ReportSpec } from "@/lib/reports/types";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#555", marginBottom: 4 },
  filters: { fontSize: 8, color: "#666", marginBottom: 8, fontStyle: "italic" },
  kpiBox: { backgroundColor: "#EFF6FF", borderRadius: 4, padding: 6, marginBottom: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: { marginRight: 14 },
  kpiLabel: { fontSize: 7, color: "#1e3a8a" },
  kpiValue: { fontSize: 10, fontWeight: 700, color: "#1F2937" },
  table: { borderWidth: 0.5, borderColor: "#bbb" },
  headerRow: { flexDirection: "row", backgroundColor: "#1F2937" },
  headerCell: { color: "white", padding: 4, fontWeight: 700, borderRightWidth: 0.5, borderColor: "#444" },
  row: { flexDirection: "row", borderTopWidth: 0.5, borderColor: "#ddd" },
  rowAlt: { backgroundColor: "#fafafa" },
  cell: { padding: 4, borderRightWidth: 0.5, borderColor: "#eee" },
  totalsRow: { flexDirection: "row", backgroundColor: "#eef2ff", borderTopWidth: 1, borderColor: "#1F2937" },
  totalsCell: { padding: 4, fontWeight: 700, borderRightWidth: 0.5, borderColor: "#ccd" },
  footer: { position: "absolute", bottom: 12, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#888" },
});

type Kpi = { label: string; value: string };

function totalWeight(cols: ColumnSpec[]): number { return cols.reduce((s, c) => s + (c.width ?? 16), 0); }
function fmt(value: any, col: ColumnSpec): string {
  if (value == null || value === "") return "";
  if (col.format === "money") return Number(value).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  if (col.format === "percent") return `${Number(value).toFixed(1)}%`;
  if (col.format === "int") return String(Math.trunc(Number(value)));
  if (col.format === "date" && typeof value === "string") return value.slice(0, 10);
  if (col.format === "datetime" && typeof value === "string") return new Date(value).toLocaleString("es-MX");
  return String(value);
}

export function ReportTablePdf({
  spec, rows, filters, generatedBy, kpis,
}: { spec: ReportSpec; rows: any[]; filters: ReportFilters; generatedBy: string; kpis?: Kpi[] }) {
  const tw = totalWeight(spec.columns);
  const widths = spec.columns.map((c) => `${(((c.width ?? 16) / tw) * 100).toFixed(2)}%`);
  const filterLine = Object.entries(filters)
    .filter(([, v]) => v != null && v !== "" && v !== "all" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length + " sel." : v}`).join("  ·  ") || "Sin filtros aplicados";

  const totals: Record<string, number> = {};
  spec.totals?.forEach((k) => { totals[k] = rows.reduce((s, r) => s + Number(r[k] ?? 0), 0); });

  const ROWS_PER_PAGE = 28;
  const pages: any[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const total = pages.length;

  return (
    <Document>
      {pages.map((pageRows, pIdx) => (
        <Page key={pIdx} size="LETTER" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{spec.name}</Text>
          <Text style={styles.subtitle}>{spec.description}</Text>
          <Text style={styles.filters}>{filterLine} · {rows.length} registros</Text>

          {pIdx === 0 && kpis && kpis.length > 0 && (
            <View style={styles.kpiBox}>
              {kpis.map((k, i) => (
                <View key={i} style={styles.kpi}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.table}>
            <View style={styles.headerRow} fixed>
              {spec.columns.map((c, i) => (
                <Text key={c.key} style={[styles.headerCell, { width: widths[i], textAlign: c.align ?? "left" }]}>{c.label}</Text>
              ))}
            </View>
            {pageRows.map((r, idx) => (
              <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
                {spec.columns.map((c, i) => (
                  <Text key={c.key} style={[styles.cell, { width: widths[i], textAlign: c.align ?? "left" }]}>
                    {fmt(r[c.key], c)}
                  </Text>
                ))}
              </View>
            ))}
            {pIdx === total - 1 && spec.totals?.length ? (
              <View style={styles.totalsRow}>
                {spec.columns.map((c, i) => (
                  <Text key={c.key} style={[styles.totalsCell, { width: widths[i], textAlign: c.align ?? "left" }]}>
                    {i === 0 ? "TOTAL" : c.key in totals ? fmt(totals[c.key], c) : ""}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.footer} fixed>
            <Text>Generado por {generatedBy} · {new Date().toLocaleString("es-MX")}</Text>
            <Text>HOPE Consulting · Página {pIdx + 1} / {total}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
