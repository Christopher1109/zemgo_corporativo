import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { portalDashboard } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/portal/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const fn = useServerFn(portalDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => fn() });

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;
  const d: any = data ?? {};
  const policies = d.policies ?? [];
  const activePolicies = policies.filter((p: any) => p.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {d.client?.first_name}</h1>
        <p className="text-sm text-slate-600">Bienvenido a tu portal personal.</p>
      </div>

      {activePolicies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-lg font-semibold">Activa tu seguro</h2>
            <p className="mt-1 text-sm text-slate-600">
              Completa tu pago para activar tu cobertura.
            </p>
            <Button asChild className="mt-4" size="lg">
              <Link to="/portal/payments">Pagar ahora</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activePolicies.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{p.program?.name}</CardTitle>
                    <p className="text-xs text-slate-500">Folio {p.folio}</p>
                  </div>
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: p.program?.color || "#0f172a" }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado</span>
                  <span className="font-medium capitalize">{p.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vigencia</span>
                  <span>{p.start_date} → {p.end_date}</span>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link to="/portal/policies">Ver detalles</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {d.next_payment ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximo pago</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">${Number(d.next_payment.amount).toLocaleString("es-MX")}</div>
              <div className="text-xs text-slate-500">Vence {d.next_payment.due_date}</div>
            </div>
            <Button asChild>
              <Link to="/portal/payments">Pagar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
