import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { portalPolicies } from "@/lib/portal/portal.functions";
import { generateCertificateClient } from "@/lib/pdf/generateCertificate.browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProgramInfo } from "@/data/portal-program-info";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ShieldCheck,
  CalendarDays,
  DollarSign,
  Users,
  CreditCard,
  Lock,
  AlertTriangle,
  Info,
  LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute("/portal/_app/policies")({
  component: PoliciesPage,
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

function isActivated(policy: any) {
  if (policy.status === "active") return true;
  return (policy.payments ?? []).some((p: any) => p.status === "paid");
}

function PoliciesPage() {
  const fn = useServerFn(portalPolicies);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "policies"], queryFn: () => fn() });
  const [openId, setOpenId] = useState<string | null>(null);
  const [genId, setGenId] = useState<string | null>(null);

  async function downloadCert(policyId: string) {
    setGenId(policyId);
    try {
      const { url } = await generateCertificateClient(policyId);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(`No se pudo generar el certificado: ${e?.message ?? "error"}`);
    } finally {
      setGenId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="h-48 rounded-xl bg-slate-200" />
      </div>
    );
  }
  const policies = ((data as any[]) ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mis Certificados</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Aquí están todos tus seguros y sus documentos.
        </p>
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No tienes certificados registrados.</p>
          </CardContent>
        </Card>
      ) : (
        policies.map((p) => {
          const open = openId === p.id;
          const activated = isActivated(p);
          const color = p.program?.color || "#0f172a";
          return (
            <Card key={p.id} className="overflow-hidden border-slate-200 shadow-sm">
              <div className="h-1.5 w-full" style={{ background: color }} />

              {/* ====== Certificate-style preview header ====== */}
              <div className="relative bg-gradient-to-br from-slate-50 to-white p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div
                      className="rounded-lg p-2.5 shrink-0"
                      style={{ background: `${color}22`, color }}
                    >
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">
                        Certificado de protección
                      </p>
                      <h3 className="text-lg font-semibold text-slate-900">{p.program?.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Folio <span className="font-mono font-semibold text-slate-700">{p.folio}</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={statusMeta(p.status).className}>
                    {statusMeta(p.status).label}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-md bg-white border border-slate-200 p-2.5">
                    <div className="flex items-center gap-1 text-slate-500 uppercase tracking-wider text-[10px]">
                      <CalendarDays className="h-3 w-3" /> Vigencia
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900 text-[11px]">
                      {formatDate(p.start_date)}
                    </div>
                    <div className="text-[11px] text-slate-500">a {formatDate(p.end_date)}</div>
                  </div>
                  <div className="rounded-md bg-white border border-slate-200 p-2.5">
                    <div className="flex items-center gap-1 text-slate-500 uppercase tracking-wider text-[10px]">
                      <DollarSign className="h-3 w-3" /> Prima
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      ${Number(p.premium ?? 0).toLocaleString("es-MX")}
                    </div>
                  </div>
                  <div className="rounded-md bg-white border border-slate-200 p-2.5">
                    <div className="flex items-center gap-1 text-slate-500 uppercase tracking-wider text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> Suma asegurada
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      ${Number(p.sum_insured ?? 0).toLocaleString("es-MX")}
                    </div>
                  </div>
                  <div className="rounded-md bg-white border border-slate-200 p-2.5">
                    <div className="flex items-center gap-1 text-slate-500 uppercase tracking-wider text-[10px]">
                      <Users className="h-3 w-3" /> Beneficiarios
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      {p.beneficiaries?.length ?? 0}
                    </div>
                  </div>
                </div>

                {/* CTAs */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {activated ? (
                    <Button
                      size="sm"
                      onClick={() => downloadCert(p.id)}
                      disabled={genId === p.id}
                      className="bg-slate-900 hover:bg-slate-800"
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      {genId === p.id ? "Generando…" : "Descargar certificado"}
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="bg-slate-900 hover:bg-slate-800">
                      <Link to="/portal/payments">
                        <CreditCard className="mr-2 h-3.5 w-3.5" /> Proceder con el pago
                      </Link>
                    </Button>
                  )}
                  {activated && p.status === "active" && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/portal/incidents/new">
                        <AlertTriangle className="mr-2 h-3.5 w-3.5" /> Reportar siniestro
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="ml-auto"
                  >
                    {open ? (
                      <>
                        Ocultar detalles <ChevronUp className="ml-1 h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        Ver más <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>

                {!activated && (
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-2.5 text-xs text-yellow-900">
                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Tu certificado se desbloquea cuando confirmemos tu primer pago.
                    </span>
                  </div>
                )}
              </div>

              {open && (
                <CardContent className="border-t border-slate-100 bg-white space-y-4 text-sm pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Deducible</div>
                      <div className="font-medium">
                        ${Number(p.deductible ?? 0).toLocaleString("es-MX")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Programa</div>
                      <div className="font-medium">{p.program?.name}</div>
                    </div>
                  </div>

                  {p.beneficiaries?.length > 0 && (
                    <div className="rounded-md bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Beneficiarios</div>
                      <ul className="space-y-1.5">
                        {p.beneficiaries.map((b: any, i: number) => (
                          <li key={i} className="flex justify-between text-xs">
                            <span className="text-slate-700">
                              {b.full_name}{" "}
                              <span className="text-slate-500">({b.relationship})</span>
                            </span>
                            <span className="font-mono font-semibold">{b.percentage}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {p.payments?.length > 0 && (
                    <div className="rounded-md bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Histórico de pagos
                      </div>
                      <ul className="space-y-1.5 text-xs">
                        {p.payments.slice(0, 5).map((pay: any) => (
                          <li
                            key={pay.id}
                            className="flex items-center justify-between gap-2 border-b border-slate-200 last:border-0 pb-1"
                          >
                            <span className="text-slate-600">{formatDate(pay.due_date)}</span>
                            <Badge
                              variant="outline"
                              className={
                                pay.status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : pay.status === "overdue"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-yellow-50 text-yellow-900 border-yellow-300"
                              }
                            >
                              {pay.status === "paid"
                                ? "Pagado"
                                : pay.status === "overdue"
                                ? "Vencido"
                                : "Pendiente"}
                            </Badge>
                            <span className="font-mono font-semibold text-slate-900">
                              ${Number(pay.amount).toLocaleString("es-MX")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Alcance + Qué hacer en caso de siniestro */}
                  {(() => {
                    const info = getProgramInfo(p.program?.code);
                    return (
                      <div className="grid gap-3 md:grid-cols-2">
                        <details className="rounded-md border border-slate-200 bg-slate-50 p-3 group">
                          <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                            <Info className="h-3.5 w-3.5" style={{ color }} />
                            Alcance de tu cobertura
                          </summary>
                          <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                            {info.alcance}
                          </p>
                        </details>
                        <details className="rounded-md border border-slate-200 bg-slate-50 p-3 group">
                          <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                            <LifeBuoy className="h-3.5 w-3.5 text-rose-600" />
                            ¿Qué hacer en caso de siniestro?
                          </summary>
                          <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                            {info.siniestro}
                          </p>
                        </details>
                      </div>
                    );
                  })()}
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
