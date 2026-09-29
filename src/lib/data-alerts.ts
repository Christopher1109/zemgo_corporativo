// Alertas de calidad de datos guardadas en clients.metadata.data_alerts.
// Se generan al importar listados de empresas (p. ej. ABC-SEPTIEMBRE-26) cuando
// un dato viene posiblemente equivocado (CURP inválida, fecha que no cuadra, etc.).

export type DataAlert = {
  field: string;
  message: string;
  level?: "warning" | "info";
  source?: string;
};

export const DATA_ALERT_FIELD_LABELS: Record<string, string> = {
  curp: "CURP",
  rfc: "RFC",
  date_of_birth: "Fecha de nacimiento",
  first_name: "Nombre",
  last_name: "Apellidos",
  gender: "Género",
};

export function getDataAlerts(metadata: unknown, field?: string): DataAlert[] {
  const raw = (metadata as any)?.data_alerts;
  if (!Array.isArray(raw)) return [];
  const alerts = raw.filter((a: any) => a && typeof a.field === "string" && typeof a.message === "string") as DataAlert[];
  return field ? alerts.filter((a) => a.field === field) : alerts;
}

/**
 * Cuando el usuario corrige un campo que tenía alerta, la quitamos de
 * data_alerts y la guardamos en resolved_data_alerts para dejar constancia.
 */
export function resolveAlertsForChangedFields(
  metadata: unknown,
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, any> | null {
  const alerts = getDataAlerts(metadata);
  if (alerts.length === 0) return null;
  const norm = (v: any) => (v == null ? "" : String(v).trim().toUpperCase());
  const changed = new Set(
    alerts.map((a) => a.field).filter((f) => f in after && norm(before[f]) !== norm(after[f])),
  );
  if (changed.size === 0) return null;
  const meta = { ...((metadata as Record<string, any>) ?? {}) };
  const now = new Date().toISOString();
  meta.data_alerts = alerts.filter((a) => !changed.has(a.field));
  meta.resolved_data_alerts = [
    ...(Array.isArray(meta.resolved_data_alerts) ? meta.resolved_data_alerts : []),
    ...alerts.filter((a) => changed.has(a.field)).map((a) => ({ ...a, resolved_at: now, previous_value: before[a.field] ?? null })),
  ];
  return meta;
}
