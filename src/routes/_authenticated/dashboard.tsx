import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Users, CreditCard, Wallet, TrendingDown, Bell,
  UserPlus, FilePlus, Stethoscope, ArrowRight, ShieldCheck, ArrowUpRight,
} from "lucide-react";

import { useProgram, useActiveProgramId } from "@/lib/program-context";
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
  const scope = useActiveProgramId();
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
    <div className="space-y-8 pb-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {scope ? activeProgram?.name : "ZEMGO"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope ? "Resumen operativo del programa activo" : "Selecciona un programa para comenzar"}
          </p>
        </div>
      </div>

      {/* Shortcuts */}
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <ShortcutCard to="/clients/new" icon={UserPlus} label="Nuevo cliente" />
        <ShortcutCard to="/policies/new" icon={FilePlus} label="Nuevo certificado" />
        <ShortcutCard to="/payments" icon={CreditCard} label="Registrar pago" />
        <ShortcutCard to="/incidents/new" icon={Stethoscope} label="Reportar siniestro" />
      </section>

      {/* Financial KPIs */}
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiBlock label="Por cobrar" value={fmtMoney(finQ.data?.receivable ?? 0)} icon={Wallet} loading={finQ.isLoading} />
        <KpiBlock label="Vencido" value={fmtMoney(finQ.data?.overdue ?? 0)} icon={TrendingDown} loading={finQ.isLoading} tone="danger" />
        <KpiBlock label="Cobrado este mes" value={fmtMoney(Number(kpi?.mtd_collected ?? 0))} icon={CreditCard} loading={kpiQ.isLoading} tone="program" />
        <KpiBlock label="Nuevos clientes (mes)" value={String(newClientsQ.data ?? 0)} icon={UserPlus} loading={newClientsQ.isLoading} />
      </section>

      {/* Alerts */}
      <section>
        <Card className="shadow-card rounded-2xl border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--program-primary) 12%, transparent)" }}>
                <Bell className="h-3.5 w-3.5" style={{ color: "var(--program-primary)" }} />
              </span>
              Alertas y renovaciones
            </CardTitle>
            <Button asChild size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-foreground">
              <Link to="/alerts">Ver todo <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {alertsQ.isLoading ? (
              <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-muted/40 animate-pulse" />)}</div>
            ) : alertItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin recordatorios pendientes. 🎉</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {alertItems.map((r: any) => {
                  const days = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
                  const isOverdue = r.status === "overdue";
                  const c = r.policies?.clients;
                  return (
                    <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-muted/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isOverdue ? "bg-destructive" : days <= 15 ? "bg-orange-500" : "bg-emerald-500",
                          )}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c?.first_name} {c?.last_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            Folio {r.policies?.folio} · {fmtMoney(Number(r.amount))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {isOverdue
                          ? <Badge className="bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-medium">Vencido {Math.abs(days)}d</Badge>
                          : days <= 15
                            ? <Badge className="bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[10px] font-medium">{days}d</Badge>
                            : <Badge variant="secondary" className="text-[10px] font-medium">{days}d</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Resumen + Latest clients */}
      <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-card rounded-2xl border-border/70">
          <CardHeader className="border-b border-border/60 px-5 py-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--program-primary) 12%, transparent)" }}>
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--program-primary)" }} />
              </span>
              Resumen del programa
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 p-5">
            {([
              ["Clientes activos", summaryQ.data?.active, "/clients"],
              ["Prospectos", summaryQ.data?.prospect, "/clients"],
              ["Inactivos", summaryQ.data?.inactive, "/clients"],
              ["Certificados vigentes", summaryQ.data?.vigentes, "/policies"],
              ["Sin número de certificado", summaryQ.data?.sinCert, "/certificates"],
              ["Siniestros abiertos", summaryQ.data?.siniestros, "/incidents"],
            ] as const).map(([label, v, to]) => (
              <Link
                key={label}
                to={to}
                className="group rounded-xl border border-border/70 bg-muted/20 p-4 transition-all hover:bg-card hover:shadow-card-hover hover:border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-snug">{label}</div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                </div>
                {summaryQ.isLoading ? (
                  <div className="h-8 w-12 rounded bg-muted animate-pulse mt-2" />
                ) : (
                  <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--program-primary)" }}>{v ?? 0}</div>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border-border/70">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--program-primary) 12%, transparent)" }}>
                <Users className="h-3.5 w-3.5" style={{ color: "var(--program-primary)" }} />
              </span>
              Últimos clientes
            </CardTitle>
            <Button asChild size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-foreground">
              <Link to="/clients">Ver todos <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {latestClientsQ.isLoading ? (
              <div className="p-5 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-muted/40 animate-pulse" />)}</div>
            ) : (latestClientsQ.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin clientes aún.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {latestClientsQ.data!.map((c: any) => (
                  <li key={c.id}>
                    <Link to="/clients" className="px-5 py-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: "var(--program-primary)" }}
                        >
                          {(c.first_name?.[0] ?? "?")}{(c.last_name?.[0] ?? "")}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.first_name} {c.last_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.state ?? "—"} · {formatDistanceToNow(parseISO(c.created_at), { locale: es, addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function ShortcutCard({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/70 bg-card shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all p-4 flex items-center gap-3"
    >
      <div
        className="h-10 w-10 shrink-0 rounded-xl grid place-items-center transition-transform group-hover:scale-105"
        style={{ backgroundColor: "color-mix(in oklab, var(--program-primary) 12%, transparent)" }}
      >
        <Icon className="h-4.5 w-4.5" style={{ color: "var(--program-primary)" }} />
      </div>
      <div className="text-sm font-medium leading-tight">{label}</div>
    </Link>
  );
}

function KpiBlock({ label, value, icon: Icon, tone, loading }: { label: string; value: string; icon: any; tone?: "danger" | "program"; loading?: boolean }) {
  const accent = tone === "danger" ? "var(--destructive)" : "var(--program-primary)";
  return (
    <Card className="shadow-card rounded-2xl border-border/70 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <span
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ backgroundColor: tone ? `color-mix(in oklab, ${accent} 12%, transparent)` : "var(--muted)" }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: tone ? accent : "var(--muted-foreground)" }} />
          </span>
        </div>
        {loading ? (
          <div className="h-8 w-24 rounded bg-muted animate-pulse mt-3" />
        ) : (
          <div
            className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"
            style={tone === "danger" ? { color: accent } : undefined}
          >
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
