// Shared report metadata (used both client UI and server fns).
export type ReportFormat = "csv" | "xlsx" | "pdf";

export type ColumnSpec = {
  key: string;
  label: string;
  width?: number; // for PDF/XLSX (in characters / px)
  align?: "left" | "right" | "center";
  format?: "money" | "date" | "datetime" | "int";
};

export type ReportSpec = {
  code: string;
  name: string;
  description: string;
  filters: Array<{ key: string; label: string; type: "program" | "date_range" | "select" | "text"; options?: { value: string; label: string }[] }>;
  columns: ColumnSpec[];
  totals?: string[]; // column keys to sum at bottom
  implemented: boolean;
  admin_only?: boolean;
};

export const REPORT_SPECS: Record<string, ReportSpec> = {
  cartera: {
    code: "cartera",
    name: "Cartera de clientes",
    description: "Listado de clientes con pólizas vigentes.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "status", label: "Estado de póliza", type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "active", label: "Activas" },
          { value: "suspended", label: "Suspendidas" },
          { value: "expired", label: "Vencidas" },
        ] },
      { key: "date_range", label: "Vigencia (inicio entre)", type: "date_range" },
    ],
    columns: [
      { key: "client_name", label: "Cliente", width: 28 },
      { key: "curp", label: "CURP", width: 20 },
      { key: "program_code", label: "Programa", width: 10 },
      { key: "folio", label: "Folio", width: 18 },
      { key: "start_date", label: "Vigencia inicio", format: "date", width: 14 },
      { key: "end_date", label: "Vigencia fin", format: "date", width: 14 },
      { key: "sum_insured", label: "Suma asegurada", format: "money", align: "right", width: 16 },
      { key: "status", label: "Estado", width: 12 },
    ],
    implemented: true,
  },
  cobranza: {
    code: "cobranza",
    name: "Cobranza",
    description: "Pagos del periodo con estado, método y atraso.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "date_range", label: "Rango de fechas (vencimiento)", type: "date_range" },
      { key: "status", label: "Estado", type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "paid", label: "Pagado" },
          { value: "pending", label: "Pendiente" },
          { value: "overdue", label: "Vencido" },
          { value: "failed", label: "Fallido" },
          { value: "cancelled", label: "Cancelado" },
        ] },
    ],
    columns: [
      { key: "client_name", label: "Cliente", width: 26 },
      { key: "folio", label: "Folio", width: 18 },
      { key: "amount", label: "Monto", format: "money", align: "right", width: 12 },
      { key: "due_date", label: "Vence", format: "date", width: 12 },
      { key: "paid_at", label: "Pagado", format: "date", width: 12 },
      { key: "method", label: "Método", width: 14 },
      { key: "status", label: "Estado", width: 12 },
      { key: "days_overdue", label: "Atraso (d)", align: "right", width: 10 },
    ],
    totals: ["amount"],
    implemented: true,
  },
  siniestralidad: {
    code: "siniestralidad", name: "Siniestralidad",
    description: "Incidentes y pases médicos por periodo.",
    filters: [{ key: "program_id", label: "Programa", type: "program" }],
    columns: [], implemented: false,
  },
  renovaciones: {
    code: "renovaciones", name: "Renovaciones",
    description: "Pólizas próximas a vencer o vencidas.",
    filters: [{ key: "program_id", label: "Programa", type: "program" }],
    columns: [], implemented: false,
  },
  ventas: {
    code: "ventas", name: "Ventas por vendedor",
    description: "Atribución y conversión por sales rep.",
    filters: [{ key: "program_id", label: "Programa", type: "program" }],
    columns: [], implemented: false,
  },
  actividad: {
    code: "actividad", name: "Actividad del sistema",
    description: "Bitácora estructurada (sólo administradores).",
    filters: [{ key: "program_id", label: "Programa", type: "program" }],
    columns: [], implemented: false, admin_only: true,
  },
};

export type ReportFilters = Record<string, any>;
