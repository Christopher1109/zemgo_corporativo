import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ActivityRow } from "@/lib/dashboard-queries";
import { Activity } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  PAYMENT_REGISTERED: "registró un pago",
  PAYMENT_CANCELLED: "canceló un pago",
  PAYMENT_REFUNDED: "reembolsó un pago",
  BANK_REFERENCE_GENERATED: "generó referencia bancaria",
  INCIDENT_REPORTED: "reportó un siniestro",
  INCIDENT_REJECTED: "rechazó un siniestro",
  PASS_ISSUED: "emitió un pase médico",
  PASS_REVOKED: "revocó un pase médico",
  PASS_AUTO_EXPIRED: "expiró pase automáticamente",
  POLICY_AUTO_SUSPENDED: "suspendió póliza por cobranza",
  CERTIFICATE_PDF_GENERATED: "generó certificado PDF",
  USER_INVITED: "invitó a un usuario",
  USER_DEACTIVATED: "desactivó a un usuario",
  USER_REACTIVATED: "reactivó a un usuario",
  ACCESS_GRANTED: "otorgó acceso a programa",
  ACCESS_CHANGED: "modificó acceso de programa",
  ACCESS_REVOKED: "revocó acceso de programa",
  REPORT_GENERATED: "generó un reporte",
};

function linkFor(row: ActivityRow): any | null {
  if (!row.entity_id) return null;
  switch (row.entity_type) {
    case "policy": return { to: "/policies/$policyId", params: { policyId: row.entity_id } };
    case "payments": return { to: "/payments/$paymentId", params: { paymentId: row.entity_id } };
    case "incident": return { to: "/incidents/$incidentId", params: { incidentId: row.entity_id } };
    case "medical_pass": return { to: "/incidents" };
    case "profiles":
    case "user_program_access": return { to: "/admin/users/$userId", params: { userId: row.entity_id } };
    default: return null;
  }
}

export function ActivityFeed({ rows, loading }: { rows?: ActivityRow[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Actividad reciente</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />)}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent className="p-0 max-h-[480px] overflow-auto">
        {!rows || rows.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">Sin actividad aún en este programa.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const verb = ACTION_LABELS[r.action] ?? r.action.toLowerCase().replace(/_/g, " ");
              const link = linkFor(r);
              const inner = (
                <div className="px-4 py-2.5 hover:bg-muted/40">
                  <div className="text-sm">
                    <span className="font-medium">{r.user_name}</span>{" "}
                    <span className="text-muted-foreground">{verb}</span>
                    {r.program_code && <span className="text-muted-foreground"> · {r.program_code}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(parseISO(r.created_at), { locale: es, addSuffix: true })}
                  </div>
                </div>
              );
              return (
                <li key={r.id}>
                  {link ? <Link {...link}>{inner}</Link> : inner}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
