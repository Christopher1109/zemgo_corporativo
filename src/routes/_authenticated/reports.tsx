import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, CreditCard, AlertTriangle, RefreshCw, TrendingUp, Activity, Lock } from "lucide-react";
import { listReportTemplates } from "@/lib/reports.functions";
import { REPORT_SPECS } from "@/lib/reports/types";
import { ReportModal } from "@/components/reports/ReportModal";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reportes — HOPE Consulting" }] }),
  component: ReportsPage,
});

const ICONS: Record<string, any> = {
  cartera: Users, cobranza: CreditCard, siniestralidad: AlertTriangle,
  renovaciones: RefreshCw, ventas: TrendingUp, actividad: Activity,
};

function ReportsPage() {
  const listFn = useServerFn(listReportTemplates);
  const q = useQuery({ queryKey: ["report-templates"], queryFn: () => listFn(), staleTime: 60_000 });
  const [openCode, setOpenCode] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
          Reportes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exporta cartera, cobranza, siniestralidad y más en Excel, PDF o CSV.
        </p>
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((t: any) => {
            const spec = REPORT_SPECS[t.code];
            const Icon = ICONS[t.code] ?? BarChart3;
            const implemented = spec?.implemented ?? false;
            return (
              <Card
                key={t.code}
                className="cursor-pointer hover:border-primary/50 transition group"
                onClick={() => setOpenCode(t.code)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className="h-10 w-10 rounded-lg grid place-items-center"
                      style={{ backgroundColor: "var(--program-secondary)" }}
                    >
                      <Icon className="h-5 w-5" style={{ color: "var(--program-primary)" }} />
                    </div>
                    <div className="flex gap-1">
                      {t.admin_only && <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3 mr-1" /> Admin</Badge>}
                      {!implemented && <Badge variant="secondary" className="text-[10px]">Próx.</Badge>}
                      {spec?.has_kpis && <Badge variant="outline" className="text-[10px]">KPIs</Badge>}
                    </div>
                  </div>
                  <CardTitle className="text-base mt-3">{t.name}</CardTitle>
                  <CardDescription className="text-xs line-clamp-2">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button variant="ghost" size="sm" className="px-0 group-hover:translate-x-1 transition">
                    Generar →
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReportModal
        reportCode={openCode}
        open={!!openCode}
        onOpenChange={(o) => !o && setOpenCode(null)}
      />
    </div>
  );
}
