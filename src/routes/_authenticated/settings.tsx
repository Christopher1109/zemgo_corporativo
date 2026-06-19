import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listProgramAlertConfig, updateProgramAlertOffsets } from "@/lib/settings.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Bell, Save, X, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configuración — HOPE Consulting" }] }),
  component: SettingsPage,
});

type Program = {
  id: string; code: string; name: string;
  color_primary: string | null;
  payment_alert_offsets: number[];
  is_active: boolean;
};

function SettingsPage() {
  const listFn = useServerFn(listProgramAlertConfig);
  const q = useQuery({ queryKey: ["programs-alert-config"], queryFn: () => listFn(), staleTime: 30_000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personaliza alertas y comportamiento por programa.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Alertas de pago por programa</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Define cuántos días antes del vencimiento se generan recordatorios automáticos.
          Se acepta una lista de offsets (ej. <code>15, 30, 60</code>).
        </p>

        {q.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-44 rounded-lg bg-muted/40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(q.data as Program[] ?? []).map((p) => <ProgramAlertsCard key={p.id} program={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgramAlertsCard({ program }: { program: Program }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateProgramAlertOffsets);
  const [offsets, setOffsets] = useState<number[]>(program.payment_alert_offsets ?? []);
  const [newVal, setNewVal] = useState("");

  useEffect(() => { setOffsets(program.payment_alert_offsets ?? []); }, [program.payment_alert_offsets]);

  const m = useMutation({
    mutationFn: async () => updateFn({ data: { program_id: program.id, offsets } }),
    onSuccess: () => {
      toast.success(`Alertas actualizadas para ${program.code}`);
      qc.invalidateQueries({ queryKey: ["programs-alert-config"] });
    },
    onError: (e: any) => toast.error(e.message || "Error al guardar"),
  });

  function addOffset() {
    const n = parseInt(newVal, 10);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast.error("Ingresa un número entre 1 y 365");
      return;
    }
    if (offsets.includes(n)) { toast.error("Ya existe ese offset"); return; }
    if (offsets.length >= 10) { toast.error("Máximo 10 alertas"); return; }
    setOffsets([...offsets, n].sort((a, b) => a - b));
    setNewVal("");
  }

  const dirty = JSON.stringify(offsets) !== JSON.stringify(program.payment_alert_offsets ?? []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div
            className="h-8 w-8 rounded-md grid place-items-center text-white text-xs font-bold"
            style={{ backgroundColor: program.color_primary ?? "var(--program-primary)" }}
          >
            {program.code.slice(0, 3).toUpperCase()}
          </div>
          {!program.is_active && <Badge variant="outline">Inactivo</Badge>}
        </div>
        <CardTitle className="text-base mt-2">{program.name}</CardTitle>
        <CardDescription className="text-xs">Código: {program.code}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Días antes del vencimiento</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[32px]">
            {offsets.length === 0 && <span className="text-xs text-muted-foreground italic">Sin alertas</span>}
            {offsets.map((d) => (
              <Badge key={d} variant="secondary" className="gap-1 pr-1">
                {d}d
                <button
                  className="hover:bg-destructive/20 rounded p-0.5"
                  onClick={() => setOffsets(offsets.filter((x) => x !== d))}
                  aria-label={`Quitar ${d} días`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            type="number" min={1} max={365}
            placeholder="ej. 7"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOffset(); } }}
            className="h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={addOffset}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button
          className="w-full"
          size="sm"
          disabled={!dirty || m.isPending || offsets.length === 0}
          onClick={() => m.mutate()}
        >
          <Save className="h-4 w-4 mr-2" />
          {m.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
}
