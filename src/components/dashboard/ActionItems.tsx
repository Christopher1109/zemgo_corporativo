import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, RefreshCw, UserX, ArrowRight } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { ActionItems as Data } from "@/lib/dashboard-queries";

function Row({
  icon: Icon,
  title,
  meta,
  badge,
  to,
}: {
  icon: any;
  title: string;
  meta: string;
  badge?: { label: string; tone: "amber" | "rose" | "blue" };
  to: any;
}) {
  const tone =
    badge?.tone === "rose" ? "bg-rose-100 text-rose-700"
    : badge?.tone === "amber" ? "bg-amber-100 text-amber-700"
    : "bg-blue-100 text-blue-700";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 border-b last:border-b-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{meta}</div>
      </div>
      {badge && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>{badge.label}</span>}
      <Button asChild size="sm" variant="ghost" className="h-8">
        <Link {...to}>
          Resolver <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </Button>
    </div>
  );
}

export function ActionItemsPanel({ data, loading }: { data?: Data; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Atención inmediata</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    );
  }
  const empty = !data || (
    data.pending_incidents.length + data.risk_payments.length +
    data.upcoming_renewals.length + data.inactive_users.length === 0
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Atención inmediata</CardTitle>
        <Badge variant="outline">
          {(data?.pending_incidents.length ?? 0) + (data?.risk_payments.length ?? 0) +
           (data?.upcoming_renewals.length ?? 0) + (data?.inactive_users.length ?? 0)} pendientes
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            🎉 Nada urgente por ahora. Buen trabajo.
          </div>
        ) : (
          <div>
            {data?.pending_incidents.map((i) => (
              <Row key={`i-${i.id}`} icon={AlertTriangle}
                title={`Siniestro de ${i.client_name}`}
                meta={`Reportado ${formatDistanceToNow(parseISO(i.reported_at), { locale: es, addSuffix: true })} — ${i.program_code}`}
                badge={{ label: "Aprobar", tone: "rose" }}
                to={{ to: "/incidents/$incidentId", params: { incidentId: i.id } }}
              />
            ))}
            {data?.risk_payments.map((p) => (
              <Row key={`p-${p.id}`} icon={Clock}
                title={`Pago vencido — ${p.client_name}`}
                meta={`Folio ${p.folio} · $${p.amount.toLocaleString("es-MX")} · ${p.days_overdue} días`}
                badge={{ label: "Suspender", tone: "amber" }}
                to={{ to: "/payments/$paymentId", params: { paymentId: p.id } }}
              />
            ))}
            {data?.upcoming_renewals.map((r) => (
              <Row key={`r-${r.id}`} icon={RefreshCw}
                title={`Renovación — ${r.client_name}`}
                meta={`Folio ${r.folio} · vence ${r.end_date}`}
                badge={{ label: "Renovar", tone: "blue" }}
                to={{ to: "/policies/$policyId", params: { policyId: r.id } }}
              />
            ))}
            {data?.inactive_users.map((u) => (
              <Row key={`u-${u.id}`} icon={UserX}
                title={`Usuario inactivo — ${u.full_name ?? "sin nombre"}`}
                meta={u.last_action ? `Última acción ${formatDistanceToNow(parseISO(u.last_action), { locale: es, addSuffix: true })}` : "Nunca ha iniciado actividad"}
                badge={{ label: "Revisar", tone: "blue" }}
                to={{ to: "/settings" }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
