import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listSalesReps } from "@/lib/sales-reps.functions";
import { useProgram } from "@/lib/program-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, TrendingUp, ArrowRight, Sparkles, RefreshCw, Plus } from "lucide-react";
import { SalesRepFormDialog } from "@/components/sales/SalesRepFormDialog";

export const Route = createFileRoute("/_authenticated/sales-reps/")({
  head: () => ({ meta: [{ title: "Vendedores — ZEMGO" }] }),
  component: SalesRepsPage,
});

function fmtMx(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

const MONTH = new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });

function SalesRepsPage() {
  const { activeProgram } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("all");
  const [newOpen, setNewOpen] = useState(false);
  const programId = scope === "active" ? (activeProgram?.id ?? null) : null;

  const listFn = useServerFn(listSalesReps);
  const reps = useQuery({
    queryKey: ["sales-reps", programId],
    queryFn: () => listFn({ data: { program_id: programId } }),
    staleTime: 30_000,
  });

  const rows = reps.data ?? [];
  const totals = rows.reduce(
    (acc, r: any) => {
      acc.month += Number(r.commission_month ?? 0);
      acc.year += Number(r.commission_year ?? 0);
      acc.collected += Number(r.collected_total ?? 0);
      acc.clients += Number(r.clients ?? 0);
      return acc;
    },
    { month: 0, year: 0, collected: 0, clients: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            Vendedores y Comisiones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            20% del primer pago de cada cliente nuevo · 10% de cada renovación cobrada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo vendedor
          </Button>
          <Button variant={scope === "all" ? "default" : "outline"} size="sm" onClick={() => setScope("all")}>
            Todos los programas
          </Button>
          <Button variant={scope === "active" ? "default" : "outline"} size="sm" onClick={() => setScope("active")}>
            {activeProgram?.name ?? "Programa activo"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Vendedores" value={String(rows.length)} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Clientes totales" value={String(totals.clients)} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Cobrado (histórico)" value={fmtMx(totals.collected)} />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label={`Comisión ${MONTH}`}
          value={fmtMx(totals.month)}
          tone="primary"
        />
      </div>

      <div className="grid gap-3">
        {reps.isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-md bg-muted/40 animate-pulse" />)
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Sin vendedores registrados.
            </CardContent>
          </Card>
        ) : (
          rows.map((r: any) => (
            <Link key={r.id} to="/sales-reps/$repId" params={{ repId: r.id }} className="block">
              <Card className="hover:border-primary/60 transition">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.full_name}</span>
                      {r.code && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {r.code}
                        </Badge>
                      )}
                      {!r.is_active && <Badge variant="secondary">inactivo</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.clients} clientes · {r.active_policies} certificados activos · {r.total_policies} en cartera
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Sparkles className="h-3 w-3" /> Nuevos: {fmtMx(r.commission_month_new)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <RefreshCw className="h-3 w-3" /> Renovaciones: {fmtMx(r.commission_month_renewal)}
                      </span>
                      <span className="text-muted-foreground">Año: {fmtMx(r.commission_year)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Comisión del mes</div>
                    <div className="text-xl font-bold tabular-nums" style={{ color: "var(--program-primary)" }}>
                      {fmtMx(r.commission_month)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Cobrado: {fmtMx(r.collected_total)}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      <SalesRepFormDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span className="capitalize">{label}</span>
          {icon}
        </div>
        <div
          className="text-2xl font-bold mt-2 tabular-nums"
          style={tone === "primary" ? { color: "var(--program-primary)" } : undefined}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
