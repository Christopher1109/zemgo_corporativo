import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, FileText, Wallet, CalendarClock, PiggyBank, RefreshCw, AlertCircle, Link2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProgram } from "@/lib/program-context";
import { PortfolioGate, KpiCard, CopyButton, PROGRAM_FORM_URLS, money, fmtDate } from "@/components/sales/portfolio-ui";

export const Route = createFileRoute("/_authenticated/mi-cartera/")({
  head: () => ({
    meta: [
      { title: "Resumen — Portal de vendedores ZEMGO" },
      { name: "description", content: "Resumen de tu cartera: clientes, certificados, renovaciones y comisiones." },
      { property: "og:title", content: "Resumen — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Resumen de tu cartera: clientes, certificados, renovaciones y comisiones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResumenPage,
});

function ResumenPage() {
  const { activeProgram, programs } = useProgram();
  return (
    <PortfolioGate>
      {(data) => {
        const ref = data.rep.ref_slug || data.rep.code || "";
        const codes = activeProgram ? [activeProgram.code] : programs.map((p) => p.code);
        const links = codes
          .filter((c) => PROGRAM_FORM_URLS[c])
          .map((code) => ({ code, url: ref ? `${PROGRAM_FORM_URLS[code]}?ref=${ref}` : PROGRAM_FORM_URLS[code] }));
        const nextRenewals = data.renewals.expiring.slice(0, 5);
        const firstName = data.rep.full_name.split(" ")[0];

        return (
          <div className="space-y-6 max-w-6xl">
            {/* Bienvenida */}
            <div
              className="rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, var(--program-primary, #0f2a4a), var(--program-accent, #1e4d8c))" }}
            >
              <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
              <div className="absolute right-20 -bottom-16 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative">
                <div className="text-xs uppercase tracking-widest opacity-80">{activeProgram?.name ?? "Portal de vendedores"}</div>
                <h1 className="text-3xl font-bold mt-1">Hola, {firstName}</h1>
                <p className="opacity-90 mt-1">
                  Tienes <strong>{data.kpis.clients}</strong> clientes y <strong>{data.kpis.active_policies}</strong> certificados vigentes.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={Users} label="Clientes" value={String(data.kpis.clients)} />
              <KpiCard icon={FileText} label="Certificados vigentes" value={String(data.kpis.active_policies)} />
              <KpiCard icon={RefreshCw} label="Por renovar (60 días)" value={String(data.renewals.expiring.length)} />
              <KpiCard icon={AlertCircle} label="Pagos vencidos" value={String(data.payments.overdue.length)} />
              <KpiCard icon={Wallet} label="Comisión del mes" value={money(data.kpis.commission_month)} />
              <KpiCard icon={PiggyBank} label="Comisión del año" value={money(data.kpis.commission_year)} />
              <KpiCard icon={CalendarClock} label="Por cobrar (60 días)" value={money(data.kpis.commission_next_60d)} hint="Comisión estimada" />
              <KpiCard icon={RefreshCw} label="Renovados" value={String(data.renewals.renewed.length)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3 border-0 shadow-sm ring-1 ring-border">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">Próximas renovaciones</h2>
                    <Link to="/mi-cartera/renovaciones" className="text-sm font-medium flex items-center gap-1" style={{ color: "var(--program-primary)" }}>
                      Ver todas <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  {nextRenewals.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No tienes certificados por vencer en los próximos 60 días.</p>
                  ) : (
                    <ul className="divide-y">
                      {nextRenewals.map((r) => (
                        <li key={r.policy_id} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.client_name}</div>
                            <div className="text-xs text-muted-foreground">Folio {r.folio ?? "—"} · vence {fmtDate(r.end_date)}</div>
                          </div>
                          <Badge variant={(r.days_to_expire ?? 99) <= 10 ? "destructive" : "secondary"} className="shrink-0">
                            {r.days_to_expire} días
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 border-0 shadow-sm ring-1 ring-border">
                <CardContent className="p-5">
                  <h2 className="font-semibold flex items-center gap-2 mb-1"><Link2 className="h-4 w-4" /> Tus ligas de registro</h2>
                  <p className="text-xs text-muted-foreground mb-4">Compártelas para que tus clientes se registren a tu nombre.</p>
                  <div className="space-y-3">
                    {links.map((l) => (
                      <div key={l.code} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Badge variant="outline">{l.code}</Badge>
                          <CopyButton text={l.url} />
                        </div>
                        <code className="block truncate text-xs text-muted-foreground">{l.url}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      }}
    </PortfolioGate>
  );
}
