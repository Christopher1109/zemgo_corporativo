import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Users, FileText, CreditCard, AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ActionItemsPanel } from "@/components/dashboard/ActionItems";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  fetchKpis, fetchPolicyDistribution, fetchTopDebtors,
  fetchMonthlyCollection, fetchMonthlyNewClients, fetchActionItems, fetchRecentActivity,
} from "@/lib/dashboard-queries";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HOPE Consulting" }] }),
  component: Dashboard,
});

const fmtMoney = (n: number) => `$${(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

function Dashboard() {
  const { activeProgram, programs } = useProgram();
  const [scopeMode, setScopeMode] = useState<"current" | "all">("current");
  const scope = scopeMode === "all" ? null : activeProgram?.id ?? null;
  const scopeKey = scope ?? "all";

  const opts = { staleTime: 5 * 60_000 };
  const kpiQ = useQuery({ queryKey: ["dash-kpi", scopeKey], queryFn: () => fetchKpis(scope), ...opts });
  const distQ = useQuery({ queryKey: ["dash-dist"], queryFn: fetchPolicyDistribution, ...opts });
  const debtQ = useQuery({ queryKey: ["dash-debt", scopeKey], queryFn: () => fetchTopDebtors(scope), ...opts });
  const colQ  = useQuery({ queryKey: ["dash-col", scopeKey],  queryFn: () => fetchMonthlyCollection(scope), ...opts });
  const newQ  = useQuery({ queryKey: ["dash-new", scopeKey],  queryFn: () => fetchMonthlyNewClients(scope), ...opts });
  const actQ  = useQuery({ queryKey: ["dash-act", scopeKey],  queryFn: () => fetchActionItems(scope), ...opts });
  const feedQ = useQuery({ queryKey: ["dash-feed", scopeKey], queryFn: () => fetchRecentActivity(scope), staleTime: 0 });

  const kpi = kpiQ.data;
  const collectionDelta = useMemo(() => {
    if (!kpi) return null;
    const prev = Number(kpi.prev_month_collected ?? 0);
    if (prev === 0) return null;
    return (Number(kpi.mtd_collected) - prev) / prev;
  }, [kpi]);
  const collectionRate = useMemo(() => {
    if (!kpi) return 0;
    const paid = Number(kpi.paid_count_mtd ?? 0);
    const overdue = Number(kpi.overdue_count ?? 0);
    const total = paid + overdue;
    return total === 0 ? 0 : paid / total;
  }, [kpi]);

  // Build pivot for time-series (one series per program)
  const programById = useMemo(() => Object.fromEntries(programs.map((p) => [p.id, p])), [programs]);
  function pivot(rows?: { program_id: string; month: string; total: number }[]) {
    if (!rows || rows.length === 0) return [];
    const months = Array.from(new Set(rows.map((r) => r.month))).sort();
    return months.map((m) => {
      const out: any = { month: format(parseISO(m), "MMM yy", { locale: es }) };
      rows.filter((r) => r.month === m).forEach((r) => {
        const p = programById[r.program_id];
        out[p?.code ?? "?"] = r.total;
      });
      return out;
    });
  }
  const colSeries = useMemo(() => pivot(colQ.data), [colQ.data, programById]);
  const newSeries = useMemo(() => pivot(newQ.data), [newQ.data, programById]);
  const seriesPrograms = useMemo(() => {
    if (scope) {
      const p = programs.find((x) => x.id === scope);
      return p ? [p] : [];
    }
    return programs;
  }, [scope, programs]);

  function refreshAll() {
    kpiQ.refetch(); distQ.refetch(); debtQ.refetch();
    colQ.refetch(); newQ.refetch(); actQ.refetch(); feedQ.refetch();
  }

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">Dashboard ejecutivo</h1>
          <p className="text-sm text-muted-foreground truncate">
            {scope ? `Programa ${activeProgram?.name}` : `Vista consolidada de los ${programs.length} programas`}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Tabs value={scopeMode} onValueChange={(v) => setScopeMode(v as any)}>
            <TabsList>
              <TabsTrigger value="current" disabled={!activeProgram}>Programa actual</TabsTrigger>
              <TabsTrigger value="all">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refrescar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-3">
        <KpiCard loading={kpiQ.isLoading} label="Clientes activos" icon={Users}
          value={kpi?.active_clients ?? 0} />
        <KpiCard loading={kpiQ.isLoading} label="Pólizas vigentes" icon={FileText}
          value={kpi?.active_policies ?? 0} />
        <KpiCard loading={kpiQ.isLoading} label="Cobrado este mes" icon={CreditCard}
          value={fmtMoney(Number(kpi?.mtd_collected ?? 0))}
          delta={collectionDelta}
          hint="vs mes anterior" />
        <KpiCard loading={kpiQ.isLoading} label="Siniestros abiertos" icon={AlertTriangle}
          value={kpi?.open_incidents ?? 0}
          flag={(kpi?.urgent_incidents ?? 0) > 0 ? "danger" : null}
          hint={(kpi?.urgent_incidents ?? 0) > 0 ? `${kpi?.urgent_incidents} >48hrs` : undefined} />
        <KpiCard loading={kpiQ.isLoading} label="Renovaciones 30d" icon={RefreshCw}
          value={kpi?.renewals_30d ?? 0} />
        <KpiCard loading={kpiQ.isLoading} label="Tasa de cobranza" icon={TrendingUp}
          value={`${(collectionRate * 100).toFixed(1)}%`}
          hint={`${kpi?.paid_count_mtd ?? 0} pagados / ${kpi?.overdue_count ?? 0} vencidos`} />
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <ChartCard title="Cobranza por mes" subtitle="Últimos 12 meses"
          loading={colQ.isLoading}
          empty={colSeries.length === 0 ? "Sin cobranza registrada aún." : null}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={colSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              <Legend />
              {seriesPrograms.map((p) => (
                <Line key={p.id} type="monotone" dataKey={p.code} stroke={p.color_primary} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Nuevos clientes por mes" subtitle="Últimos 12 meses"
          loading={newQ.isLoading}
          empty={newSeries.length === 0 ? "Sin altas en este periodo." : null}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={newSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              {seriesPrograms.map((p) => (
                <Bar key={p.id} dataKey={p.code} stackId="a" fill={p.color_primary} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución de pólizas activas" subtitle="Por programa"
          loading={distQ.isLoading}
          empty={(distQ.data ?? []).every((d) => d.count === 0) ? "Aún no hay pólizas activas." : null}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={distQ.data ?? []} dataKey="count" nameKey="name" cx="50%" cy="50%"
                   innerRadius={50} outerRadius={90} paddingAngle={2}>
                {(distQ.data ?? []).map((d) => <Cell key={d.program_id} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 10 deudores" subtitle="Mayor adeudo vencido"
          loading={debtQ.isLoading}
          empty={(debtQ.data ?? []).length === 0 ? "No hay pagos vencidos. 🎉" : null}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debtQ.data ?? []} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" fontSize={11} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="full_name" width={140} fontSize={11} />
              <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              <Bar dataKey="total_overdue" fill="var(--program-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Action items + Activity */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionItemsPanel data={actQ.data} loading={actQ.isLoading} />
        </div>
        <div>
          <ActivityFeed rows={feedQ.data} loading={feedQ.isLoading} />
        </div>
      </div>
    </div>
  );
}
