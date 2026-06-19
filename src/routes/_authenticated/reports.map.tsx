import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getPoliciesByState } from "@/lib/map.functions";
import { matchState } from "@/lib/mx-states";
import { useProgram } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapIcon, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/map")({
  head: () => ({ meta: [{ title: "Mapa de pólizas — HOPE Consulting" }] }),
  component: MapPage,
});

type Row = { state: string; total: number; active: number; suspended: number; expired: number };

function MapPage() {
  const { activeProgram } = useProgram();
  const fn = useServerFn(getPoliciesByState);
  const q = useQuery({
    queryKey: ["policies-by-state", activeProgram?.id ?? null],
    queryFn: () => fn({ data: { program_id: activeProgram?.id ?? null } }),
    staleTime: 30_000,
  });

  const rows = (q.data as Row[] | undefined) ?? [];
  const totalAll = rows.reduce((s, r) => s + Number(r.total), 0);

  const items = useMemo(() => rows
    .map((r) => ({ row: r, match: matchState(r.state) }))
    .filter((x) => x.match), [rows]);
  const unknown = rows.filter((r) => !matchState(r.state));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapIcon className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            Mapa de pólizas — México
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Distribución geográfica · Programa: <strong>{activeProgram?.name ?? "Todos"}</strong> · Total: <strong>{totalAll}</strong>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/reports"><ArrowLeft className="h-4 w-4 mr-2" />Volver a Reportes</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <MapView items={items} loading={q.isLoading} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Estados con cobertura ({items.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-1.5 sm:grid-cols-2 max-h-80 overflow-auto pr-1">
              {items.sort((a, b) => Number(b.row.total) - Number(a.row.total)).map(({ row, match }) => (
                <div key={row.state} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm">
                  <span className="truncate">{match!.name}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge variant="secondary">{Number(row.total)}</Badge>
                    {Number(row.active) > 0 && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">{Number(row.active)} act.</Badge>}
                  </div>
                </div>
              ))}
              {items.length === 0 && !q.isLoading && (
                <div className="text-sm text-muted-foreground italic">Sin datos para este programa.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Sin geolocalizar</CardTitle></CardHeader>
          <CardContent>
            {unknown.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">Todos los estados están mapeados.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {unknown.map((u) => (
                  <li key={u.state} className="flex justify-between">
                    <span className="truncate">{u.state}</span>
                    <Badge variant="outline">{Number(u.total)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MapView({ items, loading }: { items: { row: Row; match: any }[]; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [-102, 23.6],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (items.length === 0) return;
    const max = Math.max(...items.map((i) => Number(i.row.total)), 1);
    for (const { row, match } of items) {
      const total = Number(row.total);
      const size = Math.max(28, Math.min(64, 24 + (total / max) * 40));
      const el = document.createElement("div");
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:var(--program-primary,#7CB342);color:white;display:grid;place-items:center;font-weight:700;font-size:${Math.max(11, size/4)}px;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid white;cursor:pointer;`;
      el.textContent = String(total);
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<div style="font-family:inherit;font-size:13px;min-width:160px">
           <div style="font-weight:600;margin-bottom:4px">${match.name}</div>
           <div>Total: <strong>${total}</strong></div>
           <div>Activas: ${Number(row.active)}</div>
           <div>Suspendidas: ${Number(row.suspended)}</div>
           <div>Expiradas: ${Number(row.expired)}</div>
         </div>`
      );
      const marker = new maplibregl.Marker({ element: el }).setLngLat([match.lng, match.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
    }
  }, [items]);

  return (
    <div className="relative w-full" style={{ height: 520 }}>
      <div ref={ref} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm text-sm">
          Cargando mapa…
        </div>
      )}
    </div>
  );
}
