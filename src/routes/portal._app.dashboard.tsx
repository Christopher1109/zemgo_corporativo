import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { portalDashboard } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, CalendarDays, Wallet, ShieldCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/portal/_app/dashboard")({
  component: DashboardPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function statusMeta(s: string) {
  if (s === "active") return { label: "Vigente", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (s === "pending") return { label: "Pendiente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  if (s === "expired") return { label: "Vencida", className: "bg-rose-100 text-rose-800 border-rose-200" };
  return { label: s, className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function DashboardPage() {
  const fn = useServerFn(portalDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => fn() });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 rounded-xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 rounded-xl bg-slate-200" />
          <div className="h-40 rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  const d: any = data ?? {};
  const policies: any[] = d.policies ?? [];
  const activePolicies = policies.filter((p) => p.status === "active");
  const primary = activePolicies[0] ?? policies[0];
  const np = d.next_payment;
  const firstName = d.client?.first_name ?? "";

  return (
    <div className="space-y-6">
      {/* Hero / Greeting */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 shadow-sm">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-yellow-400/90">HOPE Consulting</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-light">
            Hola, <span className="font-semibold">{firstName}</span>
          </h1>
          <p className="mt-2 text-sm text-slate-300 max-w-lg">
            Este es el resumen de tu protección. Aquí encuentras tus pólizas, certificados y próximos pagos.
          </p>
        </div>
      </section>

      {!primary ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold">Activa tu seguro</h2>
            <p className="mt-1 text-sm text-slate-600">
              Completa tu pago para activar tu cobertura.
            </p>
            <Button asChild className="mt-4 bg-slate-900 hover:bg-slate-800" size="lg">
              <Link to="/portal/payments">Pagar ahora</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-slate-200">
          <div
            className="h-1.5 w-full"
            style={{ background: primary.program?.color || "#0f172a" }}
          />
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Tu seguro principal</p>
                <CardTitle className="mt-1 text-2xl">
                  {primary.program?.name}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Folio {primary.folio}</p>
              </div>
              <Badge variant="outline" className={statusMeta(primary.status).className}>
                {statusMeta(primary.status).label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
                  <CalendarDays className="h-3.5 w-3.5" /> Vigencia
                </div>
                <div className="mt-1 font-medium text-slate-900">
                  {formatDate(primary.start_date)} → {formatDate(primary.end_date)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
                  <FileText className="h-3.5 w-3.5" /> Certificado
                </div>
                <div className="mt-1 font-medium text-slate-900">PDF disponible</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="bg-slate-900 hover:bg-slate-800">
                <Link to="/portal/policies">
                  <Download className="mr-2 h-4 w-4" /> Descargar certificado
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/portal/policies">Ver detalles</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary row: next payment + report incident */}
      <div className="grid gap-4 md:grid-cols-2">
        {np ? (
          <Card className="border-yellow-200 bg-yellow-50/60">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-yellow-700" />
                <CardTitle className="text-base text-yellow-900">Próximo pago</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  ${Number(np.amount).toLocaleString("es-MX")}
                </div>
                <div className="text-xs text-slate-600">Vence {formatDate(np.due_date)}</div>
              </div>
              <Button asChild className="bg-slate-900 hover:bg-slate-800">
                <Link to="/portal/payments">Pagar</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pagos al día</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              No tienes pagos pendientes. ¡Gracias!
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <CardTitle className="text-base">¿Tuviste un siniestro?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Repórtalo en línea y te contactamos.</p>
            <Button asChild variant="outline">
              <Link to="/portal/incidents">Reportar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Other policies */}
      {activePolicies.length > 1 ? (
        <div>
          <h2 className="mb-3 text-sm uppercase tracking-wider text-slate-500 font-medium">
            Otras pólizas activas
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activePolicies.slice(1).map((p: any) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{p.program?.name}</CardTitle>
                      <p className="text-xs text-slate-500">Folio {p.folio}</p>
                    </div>
                    <div className="h-3 w-3 rounded-full" style={{ background: p.program?.color || "#0f172a" }} />
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600">
                  Vigencia: {formatDate(p.start_date)} → {formatDate(p.end_date)}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
