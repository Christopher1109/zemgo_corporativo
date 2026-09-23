// Traducción legible de los registros de auditoría (audit_log) para la UI.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  POLICY_CREATED: "Certificado creado",
  POLICY_UPDATED: "Certificado actualizado",
  POLICY_STATUS_CHANGED: "Cambio de estado del certificado",
  POLICY_RENEWED: "Certificado renovado",
  POLICY_AUTO_SUSPENDED: "Certificado suspendido por cobranza",
  CERTIFICATE_PDF_GENERATED: "Certificado PDF generado",
  PAYMENT_CREATED: "Pago programado",
  PAYMENT_REGISTERED: "Pago recibido",
  PAYMENT_CANCELLED: "Pago cancelado",
  PAYMENT_REFUNDED: "Pago reembolsado",
  PAYMENT_FAILED: "Intento de pago fallido",
  PAYMENT_MARKED_OVERDUE: "Pago marcado como vencido",
  PAYMENT_REMINDER_SENT: "Recordatorio de pago enviado",
  BANK_REFERENCE_GENERATED: "Referencia de pago generada",
  INCIDENT_REPORTED: "Siniestro reportado",
  INCIDENT_APPROVED: "Siniestro autorizado",
  INCIDENT_REJECTED: "Siniestro rechazado",
  PASS_ISSUED: "Carta de aviso de accidente emitida",
  PASS_REVOKED: "Carta de aviso de accidente revocada",
  PASS_PDF_GENERATED: "Carta de aviso de accidente generada",
  PASS_AUTO_EXPIRED: "Carta de aviso de accidente vencida",
};

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: "Estado",
  premium: "Prima",
  sum_insured: "Suma asegurada",
  deductible: "Deducible",
  amount: "Monto",
  paid_amount: "Monto cobrado",
  paid_at: "Fecha de pago",
  due_date: "Vencimiento",
  method: "Forma de pago",
  provider: "Procesador",
  reference: "Referencia",
  reason: "Motivo",
  failure_reason: "Motivo de la falla",
  start_date: "Inicio de vigencia",
  end_date: "Fin de vigencia",
  from: "Antes",
  to: "Después",
  hospital: "Hospital",
  notes: "Notas",
};

export function humanizeAuditKey(key: string) {
  const s = key.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? humanizeAuditKey(action);
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, val]) => `${AUDIT_FIELD_LABELS[k] ?? humanizeAuditKey(k)}: ${formatValue(val)}`)
      .join(" · ");
  }
  return String(v);
}

export function describeAuditDiff(diff: any): string {
  if (!diff || typeof diff !== "object") return "—";
  const parts = Object.entries(diff).map(
    ([k, v]) => `${AUDIT_FIELD_LABELS[k] ?? humanizeAuditKey(k)}: ${formatValue(v)}`,
  );
  return parts.length ? parts.join(" · ") : "—";
}
