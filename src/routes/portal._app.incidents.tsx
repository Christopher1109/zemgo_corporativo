import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { portalIncidents } from "@/lib/portal/portal.functions";
import { portalAccidentNotice } from "@/lib/portal/accident-notice.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Plus,
  Calendar,
  Clock,
  MapPin,
  Hospital,
  FileDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/portal/_app/incidents")({
  component: IncidentsPage,
});

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function IncidentsPage() {
  const fn = useServerFn(portalIncidents);
  const noticeFn = useServerFn(portalAccidentNotice);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data, isLoading } = useQuery({ queryKey: ["portal", "incidents"], queryFn: () => fn() });
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadNotice(id: string) {
    setDownloading(id);
    try {
      const { pdf_base64, filename } = await noticeFn({ data: { incident_id: id } });
      const bin = atob(pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`No fue posible generar el aviso: ${e?.message ?? "error"}`);
    } finally {
      setDownloading(null);
    }
  }

  if (pathname !== "/portal/incidents") {
    return <Outlet />;
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="h-32 rounded-xl bg-slate-200" />
      </div>
    );
  }
  const items = (data as any[]) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis Siniestros</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Reporta accidentes y descarga tu Aviso de Accidente al instante.
          </p>
        </div>
        <Button asChild className="bg-slate-900 hover:bg-slate-800">
          <Link to="/portal/incidents/new">
            <Plus className="mr-2 h-4 w-4" /> Reportar nuevo
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="mt-3 font-semibold text-slate-900">Sin siniestros reportados</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              Esperamos que sigas así. Si llegas a tener un accidente, repórtalo de inmediato
              desde aquí y descarga tu Aviso de Accidente.
            </p>
            <Button asChild className="mt-4 bg-slate-900 hover:bg-slate-800">
              <Link to="/portal/incidents/new">
                <Plus className="mr-2 h-4 w-4" /> Reportar siniestro
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((i) => {
            return (
              <Card key={i.id} className="overflow-hidden border-slate-200">
                <div className="h-1 w-full bg-emerald-400/70" />
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">
                          Siniestro · {i.policy?.program_code}
                        </div>
                        <div className="text-xs text-slate-500">
                          Folio {i.policy?.folio}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Autorizado
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-md bg-slate-50 p-2.5">
                      <div className="flex items-center gap-1 text-slate-500 text-[10px] uppercase tracking-wider">
                        <Calendar className="h-3 w-3" /> Fecha
                      </div>
                      <div className="mt-0.5 font-medium text-slate-900">
                        {formatDate(i.accident_date)}
                      </div>
                    </div>
                    {i.accident_time && (
                      <div className="rounded-md bg-slate-50 p-2.5">
                        <div className="flex items-center gap-1 text-slate-500 text-[10px] uppercase tracking-wider">
                          <Clock className="h-3 w-3" /> Hora
                        </div>
                        <div className="mt-0.5 font-medium text-slate-900">{i.accident_time}</div>
                      </div>
                    )}
                    {i.location && (
                      <div className="rounded-md bg-slate-50 p-2.5">
                        <div className="flex items-center gap-1 text-slate-500 text-[10px] uppercase tracking-wider">
                          <MapPin className="h-3 w-3" /> Lugar
                        </div>
                        <div className="mt-0.5 font-medium text-slate-900 truncate">
                          {i.location}
                        </div>
                      </div>
                    )}
                    {i.hospital && (
                      <div className="rounded-md bg-slate-50 p-2.5">
                        <div className="flex items-center gap-1 text-slate-500 text-[10px] uppercase tracking-wider">
                          <Hospital className="h-3 w-3" /> Hospital
                        </div>
                        <div className="mt-0.5 font-medium text-slate-900 truncate">
                          {i.hospital}
                        </div>
                      </div>
                    )}
                  </div>

                  {i.description && (
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Descripción
                      </div>
                      <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                        {i.description}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center gap-2 text-emerald-800 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      Aviso de Accidente disponible · vigencia 48 hrs
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading === i.id}
                      onClick={() => downloadNotice(i.id)}
                    >
                      {downloading === i.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Descargar carta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
