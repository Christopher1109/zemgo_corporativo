import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listSalesReps, listCommissionTiers } from "@/lib/sales-reps.functions";
import { useProgram } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, TrendingUp, Award, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales-reps/")({
  head: () => ({ meta: [{ title: "Vendedores — ZEMGO" }] }),
  component: SalesRepsPage,
});

function fmtMx(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function SalesRepsPage() {
  const { activeProgram } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("all");
  const programId = scope === "active" ? (activeProgram?.id ?? null) : null;

  const listFn = useServerFn(listSalesReps);
  const tiersFn = useServerFn(listCommissionTiers);
  const reps = useQuery({
    queryKey: ["sales-reps", programId],
    queryFn: () => listFn({ data: { program_id: programId } }),
    staleTime: 30_000,
  });
  const tiers = useQuery({
    queryKey: ["commission-tiers"],
    queryFn: () => tiersFn(),
    staleTime: 60_000,
  });

  const rows = reps.data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.premium += Number(r.premium_total ?? 0);
      acc.commission += Number(r.commission_amount ?? 0);
      acc.clients += Number(r.clients ?? 0);
      return acc;
    },
    { premium: 0, commission: 0, clients: 0 },
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
            Cartera, primas emitidas y comisión estimada por vendedor.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={scope === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setScope("all")}
          >
            Todos los programas
          </Button>
          <Button
            variant={scope === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setScope("active")}
          >
            {activeProgram?.name ?? "Programa activo"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Vendedores" value={String(rows.length)} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Clientes totales" value={String(totals.clients)} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Prima emitida" value={fmtMx(totals.premium)} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Comisión estimada" value={fmtMx(totals.commission)} tone="primary" />
      </div>

      {/* Tiers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4" style={{ color: "var(--program-primary)" }} />
            Escalones de comisión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            {(tiers.data ?? []).map((t: any) => (
              <div
                key={t.id}
                className="rounded-md border px-3 py-1.5 bg-muted/40"
              >
                <div className="font-medium">
                  {t.label ?? "—"}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({t.programs?.code ?? "Global"})
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {t.min_clients}–{t.max_clients ?? "∞"} clientes · {Number(t.percentage)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reps list */}
      <div className="grid gap-3">
        {reps.isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-md bg-muted/40 animate-pulse" />)
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sin vendedores registrados.</CardContent></Card>
        ) : (
          rows.map((r: any) => (
            <Link
              key={r.id}
              to="/sales-reps/$repId"
              params={{ repId: r.id }}
              className="block"
            >
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
                      {r.tier_label && (
                        <Badge className="text-[10px]" style={{ backgroundColor: "var(--program-primary)" }}>
                          {r.tier_label}
                        </Badge>
                      )}
                      {!r.is_active && <Badge variant="secondary">inactivo</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.clients} clientes · {r.active_policies} pólizas activas
                    </div>
                    {r.next_tier && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        +{r.next_tier.missing} cliente{r.next_tier.missing === 1 ? "" : "s"} para subir a
                        <strong className="ml-1">{r.next_tier.label}</strong> ({r.next_tier.percentage}%)
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Prima emitida</div>
                    <div className="font-semibold tabular-nums">{fmtMx(r.premium_total)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Comisión</div>
                    <div className="font-bold tabular-nums" style={{ color: "var(--program-primary)" }}>
                      {fmtMx(r.commission_amount)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        ({r.commission_rate}%)
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "primary" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
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
