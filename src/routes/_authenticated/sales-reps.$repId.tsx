import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesRepDetail } from "@/lib/sales-reps.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Phone, DollarSign, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales-reps/$repId")({
  head: () => ({ meta: [{ title: "Vendedor — ZEMGO" }] }),
  component: SalesRepDetailPage,
});

function fmtMx(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function SalesRepDetailPage() {
  const { repId } = Route.useParams();
  const fn = useServerFn(getSalesRepDetail);
  const q = useQuery({
    queryKey: ["sales-rep", repId],
    queryFn: () => fn({ data: { sales_rep_id: repId } }),
  });

  if (q.isLoading) {
    return <div className="h-40 rounded-md bg-muted/40 animate-pulse" />;
  }
  if (q.error || !q.data) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-destructive">No se pudo cargar el vendedor.</CardContent></Card>
    );
  }

  const { rep, policies } = q.data as any;
  const active = policies.filter((p: any) => p.status === "active");
  const totalPremium = policies.reduce((s: number, p: any) => s + Number(p.premium ?? 0), 0);
  const uniqueClients = new Set(policies.map((p: any) => p.clients?.id).filter(Boolean));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sales-reps"><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Link>
        </Button>
      </div>

      <div className="flex items-start gap-4">
        <div className="rounded-full p-3" style={{ backgroundColor: "var(--program-primary)", color: "white" }}>
          <User className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{rep.full_name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            {rep.code && <Badge variant="outline" className="font-mono">{rep.code}</Badge>}
            {rep.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{rep.phone}</span>}
            {!rep.is_active && <Badge variant="secondary">inactivo</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MiniStat label="Clientes" value={String(uniqueClients.size)} />
        <MiniStat label="Pólizas activas" value={String(active.length)} />
        <MiniStat label="Total pólizas" value={String(policies.length)} />
        <MiniStat label="Prima emitida" value={fmtMx(totalPremium)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Cartera
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {policies.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Aún no tiene pólizas asignadas.</div>
          ) : (
            <div className="divide-y">
              {policies.map((p: any) => (
                <Link
                  key={p.id}
                  to="/policies/$policyId"
                  params={{ policyId: p.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {p.clients?.first_name} {p.clients?.last_name}
                      </span>
                      {p.programs && (
                        <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: p.programs.color_primary, color: p.programs.color_primary }}>
                          {p.programs.code}
                        </Badge>
                      )}
                      <Badge variant="outline" className="font-mono text-[10px]">{p.folio}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : p.status === "expired"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-slate-100 text-slate-700"
                    }
                  >
                    {p.status}
                  </Badge>
                  <div className="text-right w-24">
                    <div className="text-xs text-muted-foreground">Prima</div>
                    <div className="font-semibold tabular-nums">{fmtMx(p.premium)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
