import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Bell, RefreshCw, AlertOctagon, Calendar, CreditCard, ExternalLink, Phone, Mail, MapPin, Search } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { getAlertsOverview } from "@/lib/alerts.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertas y renovaciones — ZEMGO" }] }),
  component: AlertsPage,
});

function fmtMx(n: number) { return n.toLocaleString("es-MX", { maximumFractionDigits: 0 }); }
function daysFrom(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

type Bucket = "all" | "overdue" | "15" | "30" | "later";
const BUCKET_OPTS: { value: Bucket; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "overdue", label: "Vencidos" },
  { value: "15", label: "≤ 15 días" },
  { value: "30", label: "≤ 30 días" },
  { value: "later", label: "> 30 días" },
];

function matchBucket(days: number, isOverdue: boolean, bucket: Bucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "overdue") return isOverdue;
  if (isOverdue) return false;
  if (bucket === "15") return days <= 15;
  if (bucket === "30") return days <= 30;
  if (bucket === "later") return days > 30;
  return true;
}

/**
 * Semáforo por periodicidad:
 *  - Mensual (recordatorios de pago): amarillo ≤15d, naranja ≤10d, rojo ≤5d o vencido, verde fuera de rango
 *  - Anual   (renovaciones):          amarillo ≤30d, naranja ≤15d, rojo ≤5d o vencido, verde fuera de rango
 */
function semaforo(days: number, isOverdue: boolean, freq: "monthly" | "annual" = "monthly"): string {
  const red = 5;
  const orange = freq === "annual" ? 15 : 10;
  const yellow = freq === "annual" ? 30 : 15;
  if (isOverdue || days <= red) return "bg-destructive/10 border-l-4 border-l-destructive";
  if (days <= orange) return "bg-orange-500/10 border-l-4 border-l-orange-500";
  if (days <= yellow) return "bg-yellow-400/10 border-l-4 border-l-yellow-500";
  return "bg-emerald-500/10 border-l-4 border-l-emerald-500";
}

/** Sort: vencidos primero (más antiguos arriba), luego próximos a vencer (días asc). */
function priorityCompare(aDays: number, aOverdue: boolean, bDays: number, bOverdue: boolean): number {
  if (aOverdue && !bOverdue) return -1;
  if (!aOverdue && bOverdue) return 1;
  // ambos vencidos: el más antiguo (días más negativos) primero
  if (aOverdue && bOverdue) return aDays - bDays;
  // ambos próximos: el más próximo primero
  return aDays - bDays;
}

function AlertsPage() {
  const { activeProgram } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("active");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [search, setSearch] = useState("");
  const programId = scope === "active" ? (activeProgram?.id ?? null) : null;
  const fn = useServerFn(getAlertsOverview);
  const q = useQuery({
    queryKey: ["alerts-overview", programId],
    queryFn: () => fn({ data: { program_id: programId } }),
    staleTime: 30_000,
  });

  const data = q.data;
  const counts = useMemo(() => {
    if (!data) return { reminders15: 0, reminders30: 0, overdue: 0, renewals30: 0, suspended: 0, overdueAmount: 0, upcomingAmount: 0 };
    let reminders15 = 0, reminders30 = 0, overdue = 0, overdueAmount = 0, upcomingAmount = 0;
    for (const p of data.upcoming as any[]) {
      const d = daysFrom(p.due_date);
      if (p.status === "overdue") { overdue++; overdueAmount += Number(p.amount); }
      else {
        upcomingAmount += Number(p.amount);
        if (d <= 15) reminders15++;
        else if (d <= 30) reminders30++;
      }
    }
    const renewals30 = (data.renewals as any[]).filter((r) => daysFrom(r.end_date) <= 30).length;
    return { reminders15, reminders30, overdue, renewals30, suspended: (data.suspended as any[]).length, overdueAmount, upcomingAmount };
  }, [data]);

  const s = search.trim().toLowerCase();
  function matchSearch(c?: any, folio?: string) {
    if (!s) return true;
    return (`${c?.first_name ?? ""} ${c?.last_name ?? ""}`.toLowerCase().includes(s) ||
            (folio ?? "").toLowerCase().includes(s));
  }

  const remFiltered = (data?.upcoming ?? [])
    .filter((r: any) => {
      const d = daysFrom(r.due_date);
      const ov = r.status === "overdue";
      return matchBucket(d, ov, bucket) && matchSearch(r.policies?.clients, r.policies?.folio);
    })
    .sort((a: any, b: any) => priorityCompare(
      daysFrom(a.due_date), a.status === "overdue",
      daysFrom(b.due_date), b.status === "overdue",
    ));
  const renFiltered = (data?.renewals ?? [])
    .filter((r: any) => {
      const d = daysFrom(r.end_date);
      return matchBucket(d, d < 0, bucket) && matchSearch(r.clients, r.folio);
    })
    .sort((a: any, b: any) => {
      const da = daysFrom(a.end_date), db = daysFrom(b.end_date);
      return priorityCompare(da, da < 0, db, db < 0);
    });
  const suspFiltered = (data?.suspended ?? []).filter((r: any) =>
    matchSearch(r.clients, r.folio)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            Alertas y Renovaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recordatorios de pago, renovaciones próximas y certificados suspendidos — {activeProgram?.name ?? "todos los programas"}.
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
        <KpiCard label="Por vencer ≤ 15 días" value={counts.reminders15} sub="Urgente" color="#ea580c" icon={Calendar} />
        <KpiCard label="Por vencer 16–30 días" value={counts.reminders30} sub="Próximo" icon={Bell} />

        <KpiCard label="Renovaciones ≤ 30 días" value={counts.renewals30} sub="Contacto comercial" color="var(--program-primary)" icon={RefreshCw} />
        <KpiCard label="Certificados suspendidos" value={counts.suspended} sub="Cobranza activa" color="#7c3aed" icon={AlertOctagon} />
      </div>

      {/* Leyenda de colores */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-medium text-muted-foreground uppercase tracking-wide">Semáforo:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-destructive" /> Vencidos o ≤ 5 días
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-orange-500" /> ≤ 10 días
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-yellow-500" /> ≤ 15 días
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> Fuera de recordatorios
          </span>
          <span className="text-muted-foreground ml-auto">Orden: vencidos primero, luego los más próximos a vencer.</span>
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-3">
        <div className="grid md:grid-cols-[1fr_220px] gap-3 items-end">
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cliente o folio…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">Vencimiento</label>
            <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUCKET_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="reminders" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="reminders">
            <Bell className="h-4 w-4 mr-2" /> Recordatorios ({remFiltered.length})
          </TabsTrigger>
          <TabsTrigger value="renewals">
            <RefreshCw className="h-4 w-4 mr-2" /> Renovaciones ({renFiltered.length})
          </TabsTrigger>
          <TabsTrigger value="suspended">
            <AlertOctagon className="h-4 w-4 mr-2" /> Suspendidas ({suspFiltered.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="mt-4">
          {q.isLoading ? <Skeleton /> : <RemindersList rows={remFiltered} />}
        </TabsContent>
        <TabsContent value="renewals" className="mt-4">
          {q.isLoading ? <Skeleton /> : <RenewalsList rows={renFiltered} />}
        </TabsContent>
        <TabsContent value="suspended" className="mt-4">
          {q.isLoading ? <Skeleton /> : <SuspendedList rows={suspFiltered} />}
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
  if (rows.length === 0) return <EmptyState text="Sin recordatorios para este filtro." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const d = daysFrom(r.due_date);
        const isOverdue = r.status === "overdue";
        const c = r.policies?.clients;
        return (
          <Card key={r.id} className={cn(semaforo(d, isOverdue))}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c?.first_name} {c?.last_name}</span>
                  <ProgramChip p={r.policies?.programs} />
                  <Badge variant="outline" className="font-mono text-[10px]">{r.policies?.folio}</Badge>
                  {isOverdue
                    ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Vencido hace {Math.abs(d)}d</Badge>
                    : d <= 5
                      ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Vence en {d}d</Badge>
                      : d <= 10
                        ? <Badge className="bg-orange-500 text-white text-[10px]">Vence en {d}d</Badge>
                        : d <= 15
                          ? <Badge className="bg-yellow-500 text-black text-[10px]">Vence en {d}d</Badge>
                          : <Badge className="bg-emerald-600 text-white text-[10px]">{d}d</Badge>
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
  if (rows.length === 0) return <EmptyState text="No hay renovaciones para este filtro." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const d = daysFrom(r.end_date);
        const isOverdue = d < 0;
        const c = r.clients;
        return (
          <Card key={r.id} className={cn(semaforo(d, isOverdue, "annual"))}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{c?.first_name} {c?.last_name}</span>
                  <ProgramChip p={r.programs} />
                  <Badge variant="outline" className="font-mono text-[10px]">{r.folio}</Badge>
                  {isOverdue
                    ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Venció hace {Math.abs(d)}d</Badge>
                    : d <= 15
                      ? <Badge className="bg-destructive text-destructive-foreground text-[10px]">Vence en {d}d</Badge>
                      : d <= 30
                        ? <Badge className="bg-orange-500 text-white text-[10px]">Vence en {d}d</Badge>
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
  if (rows.length === 0) return <EmptyState text="No hay certificados suspendidos." />;
  return (
    <div className="grid gap-2">
      {rows.map((r) => {
        const c = r.clients;
        return (
          <Card key={r.id} className="bg-destructive/10 border-l-4 border-l-destructive">
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
