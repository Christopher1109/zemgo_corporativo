import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, RefreshCw, AlertOctagon, Calendar, CreditCard, ExternalLink, Phone, Mail, MapPin } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { getAlertsOverview } from "@/lib/alerts.functions";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertas y renovaciones — HOPE Consulting" }] }),
  component: AlertsPage,
});

function fmtMx(n: number) { return n.toLocaleString("es-MX", { maximumFractionDigits: 0 }); }
function daysFrom(d: string) {
  const t = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return t;
}

function AlertsPage() {
  const { activeProgram } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("active");
  const programId = scope === "active" ? (activeProgram?.id ?? null) : null;
  const fn = useServerFn(getAlertsOverview);
  const q = useQuery({
    queryKey: ["alerts-overview", programId],
    queryFn: () => fn({ data: { program_id: programId } }),
    staleTime: 30_000,
  });

  const data = q.data;
  const counts = useMemo(() => {
    if (!data) return { reminders7: 0, reminders30: 0, overdue: 0, renewals30: 0, suspended: 0, overdueAmount: 0, upcomingAmount: 0 };
    let reminders7 = 0, reminders30 = 0, overdue = 0, overdueAmount = 0, upcomingAmount = 0;
    for (const p of data.upcoming as any[]) {
      const d = daysFrom(p.due_date);
      if (p.status === "overdue") { overdue++; overdueAmount += Number(p.amount); }
      else {
        upcomingAmount += Number(p.amount);
        if (d <= 7) reminders7++;
        else if (d <= 30) reminders30++;
      }
    }
    const renewals30 = (data.renewals as any[]).filter((r) => daysFrom(r.end_date) <= 30).length;
    return { reminders7, reminders30, overdue, renewals30, suspended: (data.suspended as any[]).length, overdueAmount, upcomingAmount };
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            Alertas y Renovaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recordatorios de pago, renovaciones próximas y pólizas suspendidas — {activeProgram?.name ?? "todos los programas"}.
          </p>
        </div>
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{activeProgram?.name ?? "Programa activo"}</SelectItem>
            <SelectItem value="all">Todos los programas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard label="Pagos vencidos" value={counts.overdue} sub={`$${fmtMx(counts.overdueAmount)} MXN`} color="#dc2626" icon={AlertOctagon} />
        <KpiCard label="Por vencer ≤ 7 días" value={counts.reminders7} sub="Recordatorio urgente" color="#ea580c" icon={Calendar} />
        <KpiCard label="Por vencer 8–30 días" value={counts.reminders30} sub="Recordatorio próximo" icon={Bell} />
        <KpiCard label="Renovaciones ≤ 30 días" value={counts.renewals30} sub="Contacto comercial" color="var(--program-primary)" icon={RefreshCw} />
        <KpiCard label="Pólizas suspendidas" value={counts.suspended} sub="Cobranza activa" color="#7c3aed" icon={AlertOctagon} />
      </div>

      <Tabs defaultValue="reminders" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="reminders">
            <Bell className="h-4 w-4 mr-2" /> Recordatorios ({(data?.upcoming.length ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="renewals">
            <RefreshCw className="h-4 w-4 mr-2" /> Renovaciones ({(data?.renewals.length ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="suspended">
            <AlertOctagon className="h-4 w-4 mr-2" /> Suspendidas ({(data?.suspended.length ?? 0)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="mt-4">
          {q.isLoading ? <Skeleton /> : <RemindersList rows={data?.upcoming ?? []} />}
        </TabsContent>
        <TabsContent value="renewals" className="mt-4">
          {q.isLoading ? <Skeleton /> : <RenewalsList rows={data?.renewals ?? []} />}
        </TabsContent>
        <TabsContent value="suspended" className="mt-4">
          {q.isLoading ? <Skeleton /> : <SuspendedList rows={data?.suspended ?? []} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="text-2xl font-bold mt-2" style={{ color }}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Skeleton() {
  return <div className="grid gap-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-md bg-muted/40 animate-pulse" />)}</div>;
}

function ProgramChip({ p }: { p: any }) {
  if (!p) return null;
  return (
    <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: p.color_primary, color: p.color_primary }}>
      {p.code}
    </Badge>
  );
}

function ContactBits({ c }: { c: any }) {
  if (!c) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
      {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
      {c.state && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.state}</span>}
    </div>
  );
}

function RemindersList({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyState text="Sin recordatorios pendientes." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const d = daysFrom(r.due_date);
        const isOverdue = r.status === "overdue";
        const c = r.policies?.clients;
        return (
          <Card key={r.id}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c?.first_name} {c?.last_name}</span>
                  <ProgramChip p={r.policies?.programs} />
                  <Badge variant="outline" className="font-mono text-[10px]">{r.policies?.folio}</Badge>
                  {isOverdue
                    ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Vencido hace {Math.abs(d)}d</Badge>
                    : d <= 7
                      ? <Badge className="bg-orange-500 text-white text-[10px]">Vence en {d}d</Badge>
                      : <Badge variant="secondary" className="text-[10px]">{d}d</Badge>
                  }
                </div>
                <ContactBits c={c} />
                {r.bank_reference && (
                  <div className="text-[11px] mt-0.5 text-muted-foreground">
                    Ref: <code className="font-mono text-foreground">{r.bank_reference}</code>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">${fmtMx(Number(r.amount))}</div>
                <div className="text-[11px] text-muted-foreground">Vence {r.due_date}</div>
                <Button asChild size="sm" variant="ghost" className="h-7 mt-1 px-2 text-xs">
                  <Link to="/payments/$paymentId" params={{ paymentId: r.id }}>
                    <CreditCard className="h-3 w-3 mr-1" /> Ver pago
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RenewalsList({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyState text="No hay renovaciones próximas." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const d = daysFrom(r.end_date);
        const c = r.clients;
        return (
          <Card key={r.id}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c?.first_name} {c?.last_name}</span>
                  <ProgramChip p={r.programs} />
                  <Badge variant="outline" className="font-mono text-[10px]">{r.folio}</Badge>
                  {d <= 15
                    ? <Badge className="bg-red-500 text-white text-[10px]">Vence en {d}d</Badge>
                    : d <= 30
                      ? <Badge className="bg-orange-500 text-white text-[10px]">{d}d</Badge>
                      : <Badge variant="secondary" className="text-[10px]">{d}d</Badge>
                  }
                </div>
                <ContactBits c={c} />
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">${fmtMx(Number(r.premium ?? 0))}</div>
                <div className="text-[11px] text-muted-foreground">Fin {r.end_date}</div>
                <Button asChild size="sm" variant="ghost" className="h-7 mt-1 px-2 text-xs">
                  <Link to="/policies/$policyId" params={{ policyId: r.id }}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Renovar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SuspendedList({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyState text="No hay pólizas suspendidas." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const c = r.clients;
        return (
          <Card key={r.id} className="border-l-4" style={{ borderLeftColor: "#7c3aed" }}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c?.first_name} {c?.last_name}</span>
                  <ProgramChip p={r.programs} />
                  <Badge variant="outline" className="font-mono text-[10px]">{r.folio}</Badge>
                  <Badge className="bg-purple-600 text-white text-[10px]">Suspendida</Badge>
                </div>
                <ContactBits c={c} />
              </div>
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link to="/policies/$policyId" params={{ policyId: r.id }}>Reactivar →</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{text}</CardContent></Card>
  );
}
