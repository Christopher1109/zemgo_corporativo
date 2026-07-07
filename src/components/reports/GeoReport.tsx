import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getPoliciesByState, getStateDetail } from "@/lib/map.functions";
import { matchState, MX_STATES } from "@/lib/mx-states";
import { MX_VIEWBOX, MX_STATE_PATHS } from "@/lib/mx-paths";
import { useProgram } from "@/lib/program-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = { state: string; total: number; active: number; suspended: number; expired: number };

export function GeoReport() {
  const { activeProgram } = useProgram();
  const fn = useServerFn(getPoliciesByState);
  const q = useQuery({
    queryKey: ["policies-by-state", activeProgram?.id ?? null],
    queryFn: () => fn({ data: { program_id: activeProgram?.id ?? null } }),
    staleTime: 30_000,
  });

  const rows = (q.data as Row[] | undefined) ?? [];
  const totalAll = rows.reduce((s, r) => s + Number(r.total), 0);

  // Build code → row
  const byCode = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) {
      const match = matchState(r.state);
      if (match) m.set(match.code, r);
    }
    return m;
  }, [rows]);

  const unknown = rows.filter((r) => !matchState(r.state));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Análisis geográfico</h2>
        <p className="text-sm text-muted-foreground">
          Distribución de certificados por estado · <strong>{activeProgram?.name ?? "Todos"}</strong> · Total: <strong>{totalAll}</strong>
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <MxMap byCode={byCode} loading={q.isLoading} />
        </CardContent>
      </Card>

      {unknown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sin geolocalizar</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm grid sm:grid-cols-2 gap-1">
              {unknown.map((u) => (
                <li key={u.state} className="flex justify-between rounded border px-2.5 py-1.5">
                  <span className="truncate">{u.state || "—"}</span>
                  <Badge variant="outline">{Number(u.total)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MxMap({ byCode, loading }: { byCode: Map<string, Row>; loading: boolean }) {
  const { activeProgram } = useProgram();
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showClients, setShowClients] = useState(false);
  const active = selected ?? hover;

  const detailFn = useServerFn(getStateDetail);
  const stateNames = selected && MX_STATES[selected]
    ? [MX_STATES[selected].name, ...MX_STATES[selected].aliases]
    : [];
  const detailQ = useQuery({
    queryKey: ["state-detail", selected, activeProgram?.id ?? null],
    enabled: !!selected,
    staleTime: 30_000,
    queryFn: () => detailFn({
      data: {
        state_names: stateNames,
        program_id: activeProgram?.id ?? null,
      },
    }),
  });

  const codes = Object.keys(MX_STATE_PATHS);
  const max = useMemo(() => {
    let m = 0;
    for (const c of codes) {
      const r = byCode.get(c);
      if (r) m = Math.max(m, Number(r.total));
    }
    return m || 1;
  }, [byCode]);

  const fillFor = (code: string) => {
    const r = byCode.get(code);
    const base = "var(--muted)";
    const accent = "var(--program-primary, var(--primary))";
    if (!r || Number(r.total) === 0) return base;
    const intensity = 0.35 + 0.65 * (Number(r.total) / max);
    return `color-mix(in oklch, ${accent} ${Math.round(intensity * 100)}%, ${base})`;
  };

  const activeRow = active ? byCode.get(active) : null;
  const activeName = active ? MX_STATES[active]?.name : null;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div className="relative w-full rounded-md border bg-card overflow-hidden">
        <svg viewBox={MX_VIEWBOX} className="w-full h-auto block" role="img" aria-label="Mapa de México por estado">
          <g>
            {codes.map((code) => {
              const r = byCode.get(code);
              const total = r ? Number(r.total) : 0;
              const isActive = active === code;
              return (
                <path
                  key={code}
                  d={MX_STATE_PATHS[code]}
                  fill={fillFor(code)}
                  stroke={isActive ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={isActive ? 1.4 : 0.8}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer transition-[stroke,filter] hover:brightness-95"
                  onMouseEnter={() => setHover(code)}
                  onMouseLeave={() => setHover((h) => (h === code ? null : h))}
                  onClick={() => setSelected((s) => (s === code ? null : code))}
                >
                  <title>{`${MX_STATES[code]?.name ?? code}: ${total} certificado${total === 1 ? "" : "s"}`}</title>
                </path>
              );
            })}
          </g>
        </svg>
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 text-sm">
            Cargando…
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          <span>0</span>
          <div className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(to right, var(--muted), var(--program-primary, var(--primary)))" }} />
          <span>{max}</span>
        </div>
      </div>

      <aside className="rounded-md border bg-card p-4 min-h-[260px]">
        {!active && (
          <div className="text-sm text-muted-foreground">
            Pasa el cursor sobre un estado para ver sus métricas. Haz clic para fijar la selección.
          </div>
        )}
        {active && (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Estado</div>
              <div className="text-lg font-semibold">{activeName}</div>
            </div>
            {!activeRow || Number(activeRow.total) === 0 ? (
              <div className="text-sm text-muted-foreground italic">Sin certificados registrados.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Kpi label="Total" value={Number(activeRow.total)} tone="default" />
                <Kpi label="Activos" value={Number(activeRow.active)} tone="success" />
                <Kpi label="Suspendidos" value={Number(activeRow.suspended)} tone="warning" />
                <Kpi label="Vencidos" value={Number(activeRow.expired)} tone="danger" />
              </div>
            )}
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Quitar selección
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "default" | "success" | "warning" | "danger" }) {
  return (
    <div className={cn(
      "rounded-md border p-2.5",
      tone === "success" && "border-emerald-500/30 bg-emerald-500/5",
      tone === "warning" && "border-amber-500/30 bg-amber-500/5",
      tone === "danger" && "border-red-500/30 bg-red-500/5",
    )}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
