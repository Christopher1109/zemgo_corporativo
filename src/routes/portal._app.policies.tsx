import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { portalPolicies } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateCertificateClient } from "@/lib/pdf/generateCertificate.browser";
import { ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/portal/_app/policies")({
  component: PoliciesPage,
});

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
      toast.error("No se pudo generar el certificado");
    } finally {
      setGenId(null);
    }
  }

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;
  const policies = (data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis Pólizas</h1>
      {policies.length === 0 ? (
        <p className="text-slate-500">No tienes pólizas registradas.</p>
      ) : (
        policies.map((p) => {
          const open = openId === p.id;
          return (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ background: p.program?.color }} />
                    <div>
                      <CardTitle className="text-base">{p.program?.name}</CardTitle>
                      <p className="text-xs text-slate-500">Folio {p.folio} · {p.status}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : p.id)}>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {open && (
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div><div className="text-slate-500 text-xs">Vigencia</div><div>{p.start_date} → {p.end_date}</div></div>
                    <div><div className="text-slate-500 text-xs">Prima</div><div>${Number(p.premium ?? 0).toLocaleString("es-MX")}</div></div>
                    <div><div className="text-slate-500 text-xs">Suma asegurada</div><div>${Number(p.sum_insured ?? 0).toLocaleString("es-MX")}</div></div>
                    <div><div className="text-slate-500 text-xs">Deducible</div><div>${Number(p.deductible ?? 0).toLocaleString("es-MX")}</div></div>
                  </div>
                  {p.beneficiaries?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Beneficiarios</div>
                      <ul className="mt-1 space-y-1">
                        {p.beneficiaries.map((b: any, i: number) => (
                          <li key={i} className="flex justify-between text-xs">
                            <span>{b.full_name} ({b.relationship})</span>
                            <span>{b.percentage}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadCert(p.id)} disabled={genId === p.id}>
                      {genId === p.id ? "Generando…" : "Descargar certificado"}
                    </Button>
                    {p.status === "active" && (
                      <Button asChild size="sm">
                        <Link to="/portal/incidents/new">Reportar siniestro</Link>
                      </Button>
                    )}
                  </div>
                  {p.payments?.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Histórico de pagos</div>
                      <ul className="mt-1 space-y-1 text-xs">
                        {p.payments.slice(0, 5).map((pay: any) => (
                          <li key={pay.id} className="flex justify-between">
                            <span>{pay.due_date}</span>
                            <span className="capitalize">{pay.status}</span>
                            <span>${Number(pay.amount).toLocaleString("es-MX")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
