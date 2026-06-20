import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { portalIncidents } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/portal/_app/incidents")({
  component: IncidentsPage,
});

function IncidentsPage() {
  const fn = useServerFn(portalIncidents);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "incidents"], queryFn: () => fn() });

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;
  const items = (data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis Siniestros</h1>
        <Button asChild>
          <Link to="/portal/incidents/new">Reportar nuevo</Link>
        </Button>
      </div>

      {items.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-slate-500">No hay siniestros reportados.</CardContent></Card>
      )}

      {items.map((i) => (
        <Card key={i.id}>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium">{i.policy?.program_code} · {i.policy?.folio}</div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize">{i.status?.replace(/_/g, " ")}</span>
            </div>
            <div className="text-xs text-slate-500">
              Accidente: {i.accident_date} {i.accident_time ?? ""} · {i.hospital ?? "—"}
            </div>
            <p className="line-clamp-2 text-xs text-slate-600">{i.description}</p>
            {i.has_active_pass && i.pass_pdf_url && (
              <Button asChild size="sm" variant="outline">
                <a href={i.pass_pdf_url} target="_blank" rel="noreferrer">Descargar pase médico</a>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
