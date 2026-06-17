import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileText, FileDown, Save, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { REPORT_SPECS, type ReportFilters } from "@/lib/reports/types";
import { generateReport, listPresets, savePreset, deletePreset } from "@/lib/reports.functions";
import { toast } from "sonner";

export function ReportModal({
  reportCode,
  open,
  onOpenChange,
}: {
  reportCode: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const spec = reportCode ? REPORT_SPECS[reportCode] : null;
  const { programs, activeProgram } = useProgram();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");

  const generateFn = useServerFn(generateReport);
  const listFn = useServerFn(listPresets);
  const saveFn = useServerFn(savePreset);
  const deleteFn = useServerFn(deletePreset);

  useEffect(() => {
    if (open && spec) {
      setFilters({ program_id: activeProgram?.id ?? "all" });
      setLastUrl(null);
      setPresetName("");
    }
  }, [open, reportCode]);

  const presetsQ = useQuery({
    queryKey: ["presets", reportCode],
    queryFn: () => listFn({ data: { report_code: reportCode! } }),
    enabled: open && !!reportCode,
  });

  const genMut = useMutation({
    mutationFn: (format: "csv" | "xlsx" | "pdf") =>
      generateFn({ data: { report_code: reportCode!, format, filters } }),
    onSuccess: (res) => {
      setLastUrl(res.url);
      toast.success(`Reporte generado (${res.rows_count} registros)`);
      window.open(res.url, "_blank");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo generar"),
  });

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { report_code: reportCode!, name: presetName, filters } }),
    onSuccess: () => { toast.success("Preset guardado"); setPresetName(""); presetsQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => presetsQ.refetch(),
  });

  if (!spec) return null;
  const set = (k: string, v: any) => setFilters((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {spec.name}
            {!spec.implemented && <Badge variant="outline">Próximamente</Badge>}
          </DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        {!spec.implemented ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Este reporte se entrega en la fase 2. Por ahora puedes usar Cartera y Cobranza.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {spec.filters.map((f) => {
                if (f.type === "program") {
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Select value={filters.program_id ?? "all"} onValueChange={(v) => set("program_id", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (f.type === "select") {
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Select value={filters[f.key] ?? "all"} onValueChange={(v) => set(f.key, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (f.type === "date_range") {
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="date" value={filters.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} placeholder="Desde" />
                        <Input type="date" value={filters.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} placeholder="Hasta" />
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* Presets */}
            {presetsQ.data && presetsQ.data.length > 0 && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="text-xs font-medium uppercase text-muted-foreground">Mis filtros guardados</div>
                <div className="flex flex-wrap gap-2">
                  {presetsQ.data.map((p: any) => (
                    <div key={p.id} className="inline-flex items-center gap-1 bg-background border rounded-full pl-3 pr-1 py-0.5 text-xs">
                      <button onClick={() => setFilters(p.filters_json)} className="hover:underline">{p.name}</button>
                      <button onClick={() => delMut.mutate(p.id)} className="p-1 hover:text-rose-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Input placeholder="Nombre del preset (opcional)" value={presetName} onChange={(e) => setPresetName(e.target.value)} className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={!presetName || saveMut.isPending}>
                <Save className="h-4 w-4 mr-2" /> Guardar
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
              <div className="flex gap-2">
                <Button onClick={() => genMut.mutate("xlsx")} disabled={genMut.isPending}>
                  {genMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Excel
                </Button>
                <Button variant="secondary" onClick={() => genMut.mutate("pdf")} disabled={genMut.isPending}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </Button>
                <Button variant="outline" onClick={() => genMut.mutate("csv")} disabled={genMut.isPending}>
                  <FileDown className="h-4 w-4 mr-2" /> CSV
                </Button>
              </div>
              {lastUrl && (
                <a href={lastUrl} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                  Volver a abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
