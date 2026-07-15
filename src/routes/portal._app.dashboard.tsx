import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { portalDashboard, portalDashboardExtras } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  CalendarDays,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  Lock,
  Sparkles,
  MessageCircle,
  User,
  Users,
  Clock,
  DollarSign,
} from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";

export const Route = createFileRoute("/portal/_app/dashboard")({
  component: DashboardPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function statusMeta(s: string) {
  if (s === "active") return { label: "Vigente", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (s === "pending") return { label: "Pendiente de pago", className: "bg-yellow-100 text-yellow-900 border-yellow-300" };
  if (s === "expired") return { label: "Vencido", className: "bg-rose-100 text-rose-800 border-rose-200" };
  return { label: s, className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function isActivated(policy: any): boolean {
  if (!policy) return false;
  if (policy.status === "active") return true;
  const payments: any[] = policy.payments ?? [];
  return payments.some((p) => p.status === "paid");
}

function DashboardPage() {
  const fn = useServerFn(portalDashboard);
  const extrasFn = useServerFn(portalDashboardExtras);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => fn() });
  const { data: extras } = useQuery({
    queryKey: ["portal", "dashboard-extras"],
    queryFn: () => extrasFn(),
    staleTime: 60_000,
  });

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
  const activated = isActivated(primary);
  const isNewClient = !!primary && !activated;

  return (
    <div className="space-y-6">
      {/* Hero / Greeting */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 shadow-sm">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-yellow-400/90">ZEMGO</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-light">
              Hola, <span className="font-semibold">{firstName}</span>
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-lg">
              {isNewClient
                ? "Bienvenido. Tu contrato está casi listo: solo falta tu primer pago para activarlo."
                : "Este es el resumen de tu protección. Aquí encuentras tus certificados y próximos pagos."}
            </p>
          </div>
          {primary?.programs?.code && (
            <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/95 p-2 shadow">
              <ProgramLogo code={primary.programs.code} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      </section>

      {!primary ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold">Aún no tienes seguros contratados</h2>
            <p className="mt-1 text-sm text-slate-600">
              En cuanto registremos tu solicitud, aparecerá aquí.
            </p>
          </CardContent>
        </Card>
      ) : isNewClient ? (
        // ============ NEW CLIENT FLOW — pending payment, blocks certificate ============
        <Card className="overflow-hidden border-yellow-300 bg-gradient-to-br from-yellow-50 to-white">
          <div className="h-1.5 w-full bg-yellow-400" />
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-yellow-400/30 p-2.5">
                  <Sparkles className="h-5 w-5 text-yellow-700" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Tu nuevo seguro</p>
                  <CardTitle className="mt-0.5 text-xl">{primary.program?.name}</CardTitle>
                  <p className="text-xs text-slate-500">Folio {primary.folio}</p>
                </div>
              </div>
              <Badge variant="outline" className={statusMeta(primary.status).className}>
                {statusMeta(primary.status).label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-slate-700">
              ¡Muchas gracias por contratar con ZEMGO! Para emitir tu certificado y activar
              tu cobertura, necesitamos confirmar tu primer pago.
            </p>

            {np ? (
              <div className="rounded-xl border border-yellow-200 bg-white p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Importe a pagar</div>
                    <div className="mt-0.5 text-3xl font-bold text-slate-900">
                      ${Number(np.amount).toLocaleString("es-MX")}
                    </div>
                    <div className="text-xs text-slate-500">
                      Vence {formatDate(np.due_date)}
                    </div>
                  </div>
                  <Button asChild size="lg" className="bg-slate-900 hover:bg-slate-800">
                    <Link to="/portal/payments">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Proceder con el pago
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <Button asChild size="lg" className="bg-slate-900 hover:bg-slate-800">
                <Link to="/portal/payments">
                  <CreditCard className="mr-2 h-4 w-4" /> Proceder con el pago
                </Link>
              </Button>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Tu certificado estará disponible para descarga en cuanto el banco confirme tu pago
                (normalmente unos minutos).
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        // ============ ACTIVATED CLIENT FLOW ============
        <Card className="overflow-hidden border-slate-200">
          <div className="h-1.5 w-full" style={{ background: primary.program?.color || "#0f172a" }} />
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">Tu seguro principal</p>
                <CardTitle className="mt-1 text-2xl">{primary.program?.name}</CardTitle>
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
                <div className="mt-1 font-medium text-emerald-700">PDF disponible</div>
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

      {/* Secondary row: next payment + report incident (only when activated) */}
      {!isNewClient && (
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

          <Card className="overflow-hidden border-rose-300 bg-gradient-to-br from-rose-50 via-white to-rose-50">
            <div className="h-1.5 w-full bg-rose-500" />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-rose-500/15 p-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <CardTitle className="text-base text-rose-900">
                    ¿Tuviste un siniestro?
                  </CardTitle>
                  <p className="text-[11px] text-rose-800/70">
                    Actívalo en línea siguiendo el paso a paso.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-700">
                Repórtalo desde el portal y descarga inmediatamente tu <strong>Carta Aviso
                de Accidente</strong> para presentarla en el hospital.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-rose-600 hover:bg-rose-700">
                  <Link to="/portal/incidents/new">Reportar ahora</Link>
                </Button>
                <IncidentStepsDialog policies={policies} />
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {/* Other policies */}
      {activePolicies.length > 1 ? (
        <div>
          <h2 className="mb-3 text-sm uppercase tracking-wider text-slate-500 font-medium">
            Otros certificados activos
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

      {/* KPIs — sólo cuando hay póliza activa */}
      {primary && activated && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiTile
            icon={<Clock className="h-4 w-4" />}
            label="Días para vencer"
            value={daysUntil(primary.end_date)}
            hint="Cobertura vigente"
          />
          <KpiTile
            icon={<DollarSign className="h-4 w-4" />}
            label="Suma asegurada"
            value={`$${Number(extras?.totals?.sum_insured ?? 0).toLocaleString("es-MX")}`}
            hint="Total protegido"
          />
          <KpiTile
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Certificados"
            value={String(extras?.totals?.active_policies ?? activePolicies.length)}
            hint="Activos a tu nombre"
          />
          <KpiTile
            icon={<Users className="h-4 w-4" />}
            label="Beneficiarios"
            value={String(extras?.beneficiaries?.length ?? 0)}
            hint="Registrados"
          />
        </div>
      )}

      {/* Coberturas + Beneficiarios */}
      {primary && activated && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Coberturas contratadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(extras?.coverages?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">Sin coberturas registradas.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {extras!.coverages.map((c: any, i: number) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <span className="text-slate-700">{c.coverage_name}</span>
                      <span className="font-medium tabular-nums">
                        {c.sum_insured
                          ? `$${Number(c.sum_insured).toLocaleString("es-MX")}`
                          : "Incluida"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-700" />
                Beneficiarios
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(extras?.beneficiaries?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">Aún no has registrado beneficiarios.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {extras!.beneficiaries.map((b: any, i: number) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <div>
                        <div className="font-medium">{b.full_name}</div>
                        <div className="text-xs text-slate-500">{b.relationship}</div>
                      </div>
                      <Badge variant="outline">{b.percentage}%</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estado de pagos */}
      {primary && activated && (extras?.payments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-slate-700" />
              Estado de pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {extras!.payments.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">
                      ${Number(p.amount).toLocaleString("es-MX")}
                    </div>
                    <div className="text-xs text-slate-500">
                      Vence {formatDate(p.due_date)}
                      {p.paid_date ? ` · Pagado ${formatDate(p.paid_date)}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusMeta(p.status).className}>
                    {statusMeta(p.status).label}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Accesos rápidos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/policies">
              <Download className="mr-2 h-4 w-4" /> Descargar certificado
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/profile">
              <User className="mr-2 h-4 w-4" /> Actualizar datos
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href="https://wa.me/525651710563"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="mr-2 h-4 w-4" /> Contactar soporte
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function daysUntil(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return diff >= 0 ? String(diff) : "0";
  } catch {
    return "—";
  }
}

function KpiTile({
  icon,
  label,
  value,
  hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
