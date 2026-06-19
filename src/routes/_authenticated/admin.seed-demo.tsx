// Admin-only page to seed/clear demo data for the kickoff demo.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkIsSuperAdmin } from "@/lib/users.functions";
import { getSeedDemoCounts, runSeedDemo, clearSeedDemo } from "@/lib/seed.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, Database, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/seed-demo")({
  component: SeedDemoPage,
});

function SeedDemoPage() {
  const isAdminFn = useServerFn(checkIsSuperAdmin);
  const adminQ = useQuery({ queryKey: ["is-super-admin"], queryFn: () => isAdminFn(), staleTime: 60_000 });

  if (adminQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Verificando permisos…</div>;
  if (!adminQ.data?.isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-md border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">Solo administradores pueden ejecutar el seed demo.</p>
      </div>
    );
  }
  return <SeedDemoControls />;
}

function SeedDemoControls() {
  const qc = useQueryClient();
  const countsFn = useServerFn(getSeedDemoCounts);
  const runFn = useServerFn(runSeedDemo);
  const clearFn = useServerFn(clearSeedDemo);
  const [lastRun, setLastRun] = useState<any>(null);

  const countsQ = useQuery({
    queryKey: ["seed-demo-counts"],
    queryFn: () => countsFn(),
    staleTime: 0,
  });

  const seedMut = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (data) => {
      setLastRun(data);
      toast.success("Seed demo completado");
      qc.invalidateQueries({ queryKey: ["seed-demo-counts"] });
      qc.invalidateQueries(); // refresh dashboard etc.
    },
    onError: (e: any) => toast.error(`Error: ${e.message}`),
  });

  const clearMut = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: (data) => {
      setLastRun({ cleared: data.deleted });
      toast.success("Datos demo eliminados");
      qc.invalidateQueries({ queryKey: ["seed-demo-counts"] });
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(`Error: ${e.message}`),
  });

  const counts = countsQ.data ?? {};
  const totalDemo = Object.values(counts).reduce((a: number, b: any) => a + (b as number), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seed Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Genera o elimina datos ficticios marcados con <code className="text-xs bg-muted px-1 rounded">metadata.is_demo = true</code> para la demo del kickoff.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <CardTitle className="text-base">Atención</CardTitle>
            <CardDescription>
              "Generar" elimina primero cualquier dato demo previo y crea uno nuevo.
              "Limpiar" borra <strong>todos</strong> los registros con <code>is_demo=true</code> en tablas operativas. No afecta registros reales.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros demo actuales</CardTitle>
          <CardDescription>Total: <strong>{totalDemo}</strong></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries(counts).map(([t, n]) => (
              <div key={t} className="rounded border bg-card px-3 py-2 flex items-center justify-between">
                <span className="text-muted-foreground">{t}</span>
                <span className="font-mono font-semibold">{n as number}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending || clearMut.isPending}>
          {seedMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          Generar datos demo
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("¿Eliminar todos los registros marcados como demo? Esta acción no afecta datos reales.")) {
              clearMut.mutate();
            }
          }}
          disabled={seedMut.isPending || clearMut.isPending}
        >
          {clearMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          Limpiar datos demo
        </Button>
      </div>

      {lastRun && (
        <Card>
          <CardHeader><CardTitle>Resultado de la última ejecución</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-96">{JSON.stringify(lastRun, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
