import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Users, CreditCard, Wallet, TrendingDown, Bell,
  UserPlus, FilePlus, Stethoscope, ArrowRight, ShieldCheck,
} from "lucide-react";

import { useProgram } from "@/lib/program-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchKpis } from "@/lib/dashboard-queries";
import { getAlertsOverview } from "@/lib/alerts.functions";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, formatDistanceToNow } from "date-fns";

import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ZEMGO" }] }),
  component: Dashboard,
});

const fmtMoney = (n: number) => `$${(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

function Dashboard() {
  const { activeProgram } = useProgram();
  const scope = activeProgram?.id ?? null;
  const scopeKey = scope ?? "none";
  const on = !!scope;

  const opts = { staleTime: 5 * 60_000 };
  const kpiQ = useQuery({ queryKey: ["dash-kpi", scopeKey], queryFn: () => fetchKpis(scope), enabled: on, ...opts });


  const alertsFn = useServerFn(getAlertsOverview);
  const alertsQ = useQuery({
    queryKey: ["dash-alerts", scopeKey],
    queryFn: () => alertsFn({ data: { program_id: scope } }),
    enabled: on,
    staleTime: 60_000,
  });

  // Financial: por cobrar / vencido (sum of pending+overdue / overdue amounts)
  const finQ = useQuery({
    queryKey: ["dash-fin", scopeKey],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("amount, status, due_date, policies!inner(program_id)")
        .in("status", ["pending", "overdue"])
        .limit(5000);
      q = q.eq("policies.program_id", scope!);
      const { data, error } = await q;
      if (error) throw error;
      let receivable = 0, overdue = 0;
      for (const p of data ?? []) {
        const a = Number((p as any).amount);
        receivable += a;
        if ((p as any).status === "overdue") overdue += a;
      }
      return { receivable, overdue };
    },
    enabled: on,
  });


  // Latest clients
  const latestClientsQ = useQuery({
    queryKey: ["dash-latest-clients", scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_programs")
        .select("enrolled_at, clients!inner(id, first_name, last_name, state, created_at)")
        .eq("program_id", scope!)
        .order("enrolled_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r.clients, created_at: r.enrolled_at ?? r.clients.created_at }));
    },
    enabled: on,
  });

  // Program summary
  const summaryQ = useQuery({
    queryKey: ["dash-summary", scopeKey],
    queryFn: async () => {
      const cnt = async (status: string) => {
        const { count } = await supabase.from("client_programs").select("id", { count: "exact", head: true }).eq("program_id", scope!).eq("status", status as any);
        return count ?? 0;
      };
      const [active, prospect, inactive] = await Promise.all([cnt("active"), cnt("prospect"), cnt("inactive")]);
      const { count: vigentes } = await supabase.from("policies").select("id", { count: "exact", head: true }).eq("program_id", scope!).eq("status", "active");
      const { count: sinCert } = await supabase.from("policies").select("id", { count: "exact", head: true }).eq("program_id", scope!).is("certificate_number", null).neq("status", "cancelled");
      const { count: siniestros } = await supabase.from("incidents").select("id, policies!inner(program_id)", { count: "exact", head: true }).eq("policies.program_id", scope!).not("status", "in", "(closed,rejected)");
      return { active, prospect, inactive, vigentes: vigentes ?? 0, sinCert: sinCert ?? 0, siniestros: siniestros ?? 0 };
    },
    enabled: on,
  });

  // New clients this month (simple count, MTD)
  const newClientsQ = useQuery({
    queryKey: ["dash-new-clients", scopeKey],
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("client_programs")
        .select("id", { count: "exact", head: true })
        .eq("program_id", scope!)
        .gte("enrolled_at", start.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    enabled: on,
  });

  const kpi = kpiQ.data;


  // Alerts top items
  const alertItems = useMemo(() => {
    const upcoming = (alertsQ.data?.upcoming ?? []) as any[];
    return upcoming.slice(0, 6);
  }, [alertsQ.data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">Dashboard</h1>
          <p className="text-sm text-muted-foreground truncate">
            {scope ? `Programa ${activeProgram?.name}` : "Selecciona un programa"}
          </p>
        </div>
      </div>

      {/* Shortcuts */}
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        <ShortcutCard to="/clients/new" icon={UserPlus} label="Nuevo cliente" />
        <ShortcutCard to="/policies/new" icon={FilePlus} label="Nuevo certificado" />
        <ShortcutCard to="/payments" icon={CreditCard} label="Registrar pago" />
        <ShortcutCard to="/incidents/new" icon={Stethoscope} label="Reportar siniestro" />
      </div>

      {/* Financial KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiBlock label="Por cobrar" value={fmtMoney(finQ.data?.receivable ?? 0)} icon={Wallet} loading={finQ.isLoading} />
        <KpiBlock label="Vencido" value={fmtMoney(finQ.data?.overdue ?? 0)} icon={TrendingDown} loading={finQ.isLoading} color="#dc2626" />
        <KpiBlock label="Cobrado este mes" value={fmtMoney(Number(kpi?.mtd_collected ?? 0))} icon={CreditCard} loading={kpiQ.isLoading} color="var(--program-primary)" />
        <KpiBlock label="Nuevos clientes (mes)" value={String(newClientsQ.data ?? 0)} icon={UserPlus} loading={newClientsQ.isLoading} />
      </div>

      {/* Alerts + Pending ops */}
      <div className="grid gap-4 grid-cols-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Alertas y renovaciones
            </CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link to="/alerts">Ver todo <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {alertsQ.isLoading ? (
              <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />)}</div>
            ) : alertItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin recordatorios pendientes. 🎉</div>
            ) : (
              <ul className="divide-y">
                {alertItems.map((r: any) => {
                  const days = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
                  const isOverdue = r.status === "overdue";
                  const c = r.policies?.clients;
                  const tone = isOverdue ? "bg-destructive/10" : days <= 15 ? "bg-orange-500/10" : "";
                  return (
                    <li key={r.id} className={cn("px-4 py-2.5 flex items-center justify-between gap-3", tone)}>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c?.first_name} {c?.last_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Folio {r.policies?.folio} · {fmtMoney(Number(r.amount))}
                        </div>
                      </div>
                      <div className="text-right">
                        {isOverdue
                          ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Vencido {Math.abs(days)}d</Badge>
                          : days <= 15
                            ? <Badge className="bg-orange-500 text-white text-[10px]">{days}d</Badge>
                            : <Badge variant="secondary" className="text-[10px]">{days}d</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Resumen + Latest clients */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Resumen del programa</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              ["Clientes activos", summaryQ.data?.active, "/clients"],
              ["Prospectos", summaryQ.data?.prospect, "/clients"],
              ["Inactivos", summaryQ.data?.inactive, "/clients"],
              ["Certificados vigentes", summaryQ.data?.vigentes, "/policies"],
              ["Sin número de certificado", summaryQ.data?.sinCert, "/certificates"],
              ["Siniestros abiertos", summaryQ.data?.siniestros, "/incidents"],
            ] as const).map(([label, v, to]) => (
              <Link key={label} to={to} className="rounded-lg border p-3 hover:border-primary/50 transition">
                <div className="text-xs text-muted-foreground">{label}</div>
                {summaryQ.isLoading ? <div className="h-7 w-12 rounded bg-muted animate-pulse mt-1" /> : <div className="text-2xl font-bold mt-1" style={{ color: "var(--program-primary)" }}>{v ?? 0}</div>}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Últimos clientes</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link to="/clients">Ver todos <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {latestClientsQ.isLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />)}</div>
            ) : (latestClientsQ.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin clientes aún.</div>
            ) : (
              <ul className="divide-y">
                {latestClientsQ.data!.map((c: any) => (
                  <li key={c.id}>
                    <Link to="/clients" className="px-4 py-2.5 hover:bg-muted/40 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.state ?? "—"} · {formatDistanceToNow(parseISO(c.created_at), { locale: es, addSuffix: true })}
                        </div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function ShortcutCard({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border bg-card hover:border-primary/50 hover:shadow-sm transition p-3 flex items-center gap-3"
    >
      <div className="h-9 w-9 rounded-md grid place-items-center" style={{ backgroundColor: "var(--program-secondary)" }}>
        <Icon className="h-4 w-4" style={{ color: "var(--program-primary)" }} />
      </div>
      <div className="text-sm font-medium">{label}</div>
    </Link>
  );
}

function KpiBlock({ label, value, icon: Icon, color, loading }: { label: string; value: string; icon: any; color?: string; loading?: boolean }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color ?? "var(--program-primary)" }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4" style={{ color: color ?? "var(--program-primary)" }} />
        </div>
        {loading ? (
          <div className="h-7 w-24 rounded bg-muted animate-pulse mt-2" />
        ) : (
          <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

