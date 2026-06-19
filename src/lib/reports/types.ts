// Shared report metadata (used both client UI and server fns).
export type ReportFormat = "csv" | "xlsx" | "pdf";

export type ColumnSpec = {
  key: string;
  label: string;
  width?: number; // for PDF/XLSX (in characters / px)
  align?: "left" | "right" | "center";
  format?: "money" | "date" | "datetime" | "int" | "percent";
};

export type FilterSpec = {
  key: string;
  label: string;
  type: "program" | "date_range" | "select" | "text" | "multi_select" | "window";
  options?: { value: string; label: string }[];
};

export type ReportSpec = {
  code: string;
  name: string;
  description: string;
  filters: FilterSpec[];
  columns: ColumnSpec[];
  totals?: string[]; // column keys to sum at bottom
  implemented: boolean;
  admin_only?: boolean;
  has_kpis?: boolean;
  max_rows?: number;
  supports_preview?: boolean;
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
    supports_preview: true,
  },
  cobranza: {
    code: "cobranza",
    name: "Cobranza",
    description: "Pagos del periodo con estado, método y atraso.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "date_range", label: "Rango (vencimiento)", type: "date_range" },
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
    code: "siniestralidad",
    name: "Siniestralidad",
    description: "Incidentes y pases médicos por periodo.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "date_range", label: "Rango (fecha de accidente)", type: "date_range" },
      { key: "status", label: "Estado", type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "reported", label: "Reportado" },
          { value: "pending_review", label: "En revisión" },
          { value: "pass_issued", label: "Pase emitido" },
          { value: "pass_expired", label: "Pase expirado" },
          { value: "in_treatment", label: "En tratamiento" },
          { value: "closed", label: "Cerrado" },
          { value: "rejected", label: "Rechazado" },
        ] },
      { key: "hospital", label: "Hospital (contiene)", type: "text" },
    ],
    columns: [
      { key: "incident_folio", label: "Folio inc.", width: 12 },
      { key: "client_name", label: "Cliente", width: 24 },
      { key: "folio", label: "Póliza", width: 16 },
      { key: "accident_date", label: "Fecha", format: "date", width: 12 },
      { key: "description", label: "Descripción", width: 36 },
      { key: "hospital", label: "Hospital", width: 22 },
      { key: "status", label: "Estado", width: 14 },
      { key: "passes_count", label: "# Pases", align: "right", format: "int", width: 8 },
      { key: "sum_insured", label: "Suma aseg.", format: "money", align: "right", width: 14 },
    ],
    totals: ["sum_insured"],
    has_kpis: true,
    implemented: true,
  },
  renovaciones: {
    code: "renovaciones",
    name: "Renovaciones",
    description: "Pólizas próximas a vencer o vencidas.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "window_days", label: "Ventana (días al vencimiento)", type: "window" },
      { key: "renewal_status", label: "Estado de renovación", type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "pending", label: "Por contactar" },
          { value: "contacted", label: "Contactados" },
          { value: "renewed", label: "Renovados" },
        ] },
    ],
    columns: [
      { key: "client_name", label: "Cliente", width: 26 },
      { key: "folio", label: "Folio actual", width: 18 },
      { key: "end_date", label: "Vigencia fin", format: "date", width: 14 },
      { key: "days_to_expire", label: "Días restantes", align: "right", format: "int", width: 12 },
      { key: "premium", label: "Prima actual", format: "money", align: "right", width: 14 },
      { key: "renewal_status_label", label: "Estado renovación", width: 16 },
    ],
    implemented: true,
    supports_preview: true,
  },
  ventas: {
    code: "ventas",
    name: "Ventas por vendedor",
    description: "Atribución y conversión por vendedor.",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "date_range", label: "Rango (alta de cliente)", type: "date_range" },
      { key: "sales_rep_ids", label: "Vendedores", type: "multi_select" },
    ],
    columns: [
      { key: "sales_rep_name", label: "Vendedor", width: 26 },
      { key: "source", label: "Fuente", width: 20 },
      { key: "clients_captured", label: "Clientes", align: "right", format: "int", width: 10 },
      { key: "policies_issued", label: "Pólizas", align: "right", format: "int", width: 10 },
      { key: "total_premium", label: "Prima total", format: "money", align: "right", width: 16 },
      { key: "conversion_rate", label: "Conv. %", format: "percent", align: "right", width: 10 },
    ],
    totals: ["clients_captured", "policies_issued", "total_premium"],
    implemented: true,
  },
  actividad: {
    code: "actividad",
    name: "Actividad del sistema",
    description: "Bitácora estructurada (sólo administradores).",
    filters: [
      { key: "program_id", label: "Programa", type: "program" },
      { key: "date_range", label: "Rango (fecha)", type: "date_range" },
      { key: "user_ids", label: "Usuarios", type: "multi_select" },
      { key: "actions", label: "Tipos de acción", type: "multi_select" },
      { key: "entities", label: "Entidades", type: "multi_select",
        options: [
          { value: "policy", label: "Pólizas" },
          { value: "clients", label: "Clientes" },
          { value: "payments", label: "Pagos" },
          { value: "incident", label: "Siniestros" },
          { value: "medical_pass", label: "Pases médicos" },
          { value: "profiles", label: "Usuarios" },
          { value: "user_program_access", label: "Accesos" },
          { value: "report", label: "Reportes" },
        ] },
    ],
    columns: [
      { key: "created_at", label: "Fecha/Hora", format: "datetime", width: 18 },
      { key: "user_name", label: "Usuario", width: 22 },
      { key: "action", label: "Acción", width: 24 },
      { key: "entity_type", label: "Entidad", width: 14 },
      { key: "entity_id", label: "ID", width: 28 },
      { key: "program_code", label: "Programa", width: 10 },
      { key: "ip_address", label: "IP", width: 14 },
    ],
    implemented: true,
    admin_only: true,
    max_rows: 10000,
  },
};

export type ReportFilters = Record<string, any>;
