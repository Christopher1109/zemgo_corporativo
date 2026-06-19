import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Users, CreditCard, AlertTriangle, RefreshCw, TrendingUp, Activity, Map as MapIcon } from "lucide-react";
import { ReportPanel } from "@/components/reports/ReportPanel";
import { GeoReport } from "@/components/reports/GeoReport";

const tabSchema = z.object({
  tab: z.enum(["cartera", "cobranza", "siniestralidad", "renovaciones", "ventas", "actividad", "geo"]).optional(),
});

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reportes — HOPE Consulting" }] }),
  validateSearch: tabSchema,
  component: ReportsPage,
});

const TABS = [
  { value: "cartera", label: "Cartera", icon: Users },
  { value: "cobranza", label: "Cobranza", icon: CreditCard },
  { value: "siniestralidad", label: "Siniestralidad", icon: AlertTriangle },
  { value: "renovaciones", label: "Renovaciones", icon: RefreshCw },
  { value: "ventas", label: "Ventas", icon: TrendingUp },
  { value: "actividad", label: "Actividad", icon: Activity },
  { value: "geo", label: "Análisis geográfico", icon: MapIcon },
] as const;

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? "cartera";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
          Reportes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Selecciona un reporte para previsualizar y exportar en Excel, PDF o CSV.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as any } })}
        className="w-full"
      >
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 bg-muted/40 p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-background">
                <Icon className="h-4 w-4 mr-1.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TABS.filter((t) => t.value !== "geo").map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-5">
            <ReportPanel reportCode={t.value} />
          </TabsContent>
        ))}
        <TabsContent value="geo" className="mt-5">
          <GeoReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
