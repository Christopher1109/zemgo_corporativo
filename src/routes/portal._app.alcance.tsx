import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { portalDashboard } from "@/lib/portal/portal.functions";
import { getProgramInfo, type CoverageLine } from "@/data/portal-program-info";
import { ProgramLogo } from "@/components/program-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  HeartPulse,
  Stethoscope,
  Activity,
  Cross,
  Accessibility,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/portal/_app/alcance")({
  component: AlcancePage,
});

/**
 * Paleta por programa — inspirada en las tarjetas de marketing:
 *   ABC        → tarjeta blanca con acento verde
 *   FUTCARE    → tarjeta azul con texto blanco
 *   MCV        → tarjeta guinda/rosada con texto blanco
 */
type Theme = {
  card: string;         // fondo de la tarjeta (contenedor de cada cobertura)
  amount: string;       // color del monto principal
  label: string;        // color del label
  panel: string;        // fondo del bloque general del programa
  header: string;       // fondo del header
  headerText: string;   // texto del header
  chip: string;         // color de chips
};

const THEMES: Record<string, Theme> = {
  ABC: {
    panel: "bg-white border-emerald-200",
    header: "bg-emerald-50",
    headerText: "text-emerald-900",
    card: "bg-white border-slate-200 shadow-sm",
    amount: "text-emerald-600",
    label: "text-slate-700",
    chip: "bg-emerald-100 text-emerald-800",
  },
  FUTCARE: {
    panel: "bg-slate-900 border-slate-800",
    header: "bg-slate-800",
    headerText: "text-white",
    card: "bg-[#4a86b8] text-white border-transparent",
    amount: "text-white",
    label: "text-white/90",
    chip: "bg-white/20 text-white",
  },
  "FUT-CARE": {
    panel: "bg-slate-900 border-slate-800",
    header: "bg-slate-800",
    headerText: "text-white",
    card: "bg-[#4a86b8] text-white border-transparent",
    amount: "text-white",
    label: "text-white/90",
    chip: "bg-white/20 text-white",
  },
  MCV: {
    panel: "bg-slate-900 border-slate-800",
    header: "bg-slate-800",
    headerText: "text-white",
    card: "bg-[#b06a7d] text-white border-transparent",
    amount: "text-white",
    label: "text-white/90",
    chip: "bg-white/20 text-white",
  },
};

const DEFAULT_THEME: Theme = {
  panel: "bg-white border-slate-200",
  header: "bg-slate-50",
  headerText: "text-slate-900",
  card: "bg-white border-slate-200 shadow-sm",
  amount: "text-slate-900",
  label: "text-slate-600",
  chip: "bg-slate-100 text-slate-700",
};

function themeFor(code?: string | null): Theme {
  if (!code) return DEFAULT_THEME;
  return THEMES[code.toUpperCase()] ?? DEFAULT_THEME;
}

/** Elige un ícono según palabras clave del label. */
function iconFor(label: string) {
  const l = label.toLowerCase();
  if (l.includes("funerario") || l.includes("fallecimiento") || l.includes("muerte"))
    return Cross;
  if (l.includes("gastos médicos") || l.includes("hospital")) return Stethoscope;
  if (l.includes("pérdid") || l.includes("orgánica")) return Accessibility;
  if (l.includes("deportivo") || l.includes("partido") || l.includes("entrenamiento"))
    return Activity;
  return HeartPulse;
}

function AlcancePage() {
  const fn = useServerFn(portalDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => fn(),
  });

  if (isLoading) {
    return <div className="h-40 rounded-xl bg-slate-200 animate-pulse" />;
  }

  const policies: any[] = (data as any)?.policies ?? [];
  // Programas únicos (por código)
  const seen = new Set<string>();
  const programs: Array<{ code: string; name: string; color?: string }> = [];
  for (const p of policies) {
    const code = p.program?.code ?? p.programs?.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    programs.push({
      code,
      name: p.program?.name ?? p.programs?.name ?? code,
      color: p.program?.color ?? p.programs?.color_primary,
    });
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-slate-600 text-sm">
          Aún no tienes programas contratados. Cuando registremos tu solicitud
          verás aquí el alcance de tus coberturas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          Alcance de tus programas
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Estos son los beneficios que tienes contratados. Consulta el detalle de cada programa,
          los montos protegidos y qué hacer en caso de un siniestro.
        </p>
      </div>

      {programs.map((p) => (
        <ProgramAlcanceSection key={p.code} code={p.code} name={p.name} />
      ))}
    </div>
  );
}

function ProgramAlcanceSection({ code, name }: { code: string; name: string }) {
  const info = getProgramInfo(code);
  const t = themeFor(code);

  return (
    <section className={`rounded-2xl border overflow-hidden ${t.panel}`}>
      {/* Header */}
      <div className={`px-5 md:px-8 py-5 flex items-center gap-4 ${t.header}`}>
        <div className="h-12 w-12 shrink-0 rounded-lg bg-white/95 grid place-items-center p-1.5 shadow">
          <ProgramLogo code={code} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] uppercase tracking-widest opacity-70 ${t.headerText}`}>
            Programa
          </p>
          <h2 className={`text-xl md:text-2xl font-semibold truncate ${t.headerText}`}>
            {name}
          </h2>
        </div>
      </div>

      {/* Descripción */}
      {info.alcance && (
        <div className={`px-5 md:px-8 py-5 border-t ${
          t.panel.includes("bg-slate-900") ? "border-white/10 text-slate-200" : "border-slate-100 text-slate-700"
        }`}>
          <p className="text-sm leading-relaxed">{info.alcance}</p>
        </div>
      )}

      {/* Coberturas — tarjetas grandes */}
      {info.coverages.length > 0 && (
        <div className={`px-5 md:px-8 pb-6 pt-2 border-t ${
          t.panel.includes("bg-slate-900") ? "border-white/10" : "border-slate-100"
        }`}>
          <p className={`mb-4 text-xs uppercase tracking-widest font-medium ${
            t.panel.includes("bg-slate-900") ? "text-white/70" : "text-slate-500"
          }`}>
            Coberturas
          </p>
          <div className={`grid gap-4 ${
            info.coverages.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
          }`}>
            {info.coverages.map((c, i) => (
              <CoverageCard key={i} coverage={c} theme={t} />
            ))}
          </div>
        </div>
      )}

      {/* Qué hacer en caso de siniestro */}
      {info.siniestro.length > 0 && (
        <div className={`px-5 md:px-8 py-6 border-t ${
          t.panel.includes("bg-slate-900")
            ? "border-white/10 bg-slate-950/40"
            : "border-slate-100 bg-slate-50"
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <div className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${
              t.panel.includes("bg-slate-900") ? "bg-rose-500/20 text-rose-300" : "bg-rose-100 text-rose-700"
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className={`font-semibold ${
                t.panel.includes("bg-slate-900") ? "text-white" : "text-slate-900"
              }`}>
                ¿Qué hacer en caso de siniestro?
              </h3>
              <p className={`text-xs ${
                t.panel.includes("bg-slate-900") ? "text-white/70" : "text-slate-600"
              }`}>
                Sigue estos pasos para activar tu cobertura.
              </p>
            </div>
          </div>
          <ol className="space-y-2">
            {info.siniestro.map((step, i) => (
              <li key={i} className={`flex items-start gap-3 text-sm ${
                t.panel.includes("bg-slate-900") ? "text-slate-200" : "text-slate-700"
              }`}>
                <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${
                  t.panel.includes("bg-slate-900")
                    ? "bg-yellow-400/20 text-yellow-300"
                    : "bg-yellow-100 text-yellow-800"
                }`}>
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <Button asChild size="sm" className="bg-rose-600 hover:bg-rose-700">
              <Link to="/portal/incidents/new">
                Reportar un siniestro <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CoverageCard({ coverage, theme }: { coverage: CoverageLine; theme: Theme }) {
  const Icon = iconFor(coverage.label);
  const isDark = theme.card.includes("text-white");
  return (
    <div className={`rounded-2xl border p-5 flex flex-col items-center text-center gap-3 ${theme.card}`}>
      <div className={`h-12 w-12 rounded-full grid place-items-center ${
        isDark ? "bg-white/15" : "bg-emerald-50"
      }`}>
        <Icon className={`h-6 w-6 ${isDark ? "text-white" : "text-emerald-700"}`} />
      </div>
      <p className={`text-sm font-semibold leading-snug ${theme.label}`}>
        {coverage.label}
      </p>
      <p className={`text-[11px] uppercase tracking-wider ${
        isDark ? "text-white/70" : "text-slate-500"
      }`}>
        Suma asegurada
      </p>
      <p className={`text-2xl md:text-3xl font-extrabold tabular-nums ${theme.amount}`}>
        {coverage.amount}
      </p>
      <div className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${theme.chip}`}>
        <ShieldCheck className="h-3 w-3" /> Incluida
      </div>
    </div>
  );
}
