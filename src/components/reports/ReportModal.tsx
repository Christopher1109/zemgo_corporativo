import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, FileDown, Save, Loader2, ExternalLink, Trash2, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { REPORT_SPECS, type ReportFilters, type FilterSpec } from "@/lib/reports/types";
import {
  generateReport, listPresets, savePreset, deletePreset,
  previewReport, listAuditMeta, listSalesReps, markRenewalContacted,
} from "@/lib/reports.functions";
import { toast } from "sonner";

export function ReportModal({
  reportCode, open, onOpenChange,
}: {
  reportCode: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const spec = reportCode ? REPORT_SPECS[reportCode] : null;
  const { programs, activeProgram } = useProgram();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [contactNotes, setContactNotes] = useState<Record<string, string>>({});

  const generateFn = useServerFn(generateReport);
  const listFn = useServerFn(listPresets);
  const saveFn = useServerFn(savePreset);
  const deleteFn = useServerFn(deletePreset);
  const previewFn = useServerFn(previewReport);
  const auditMetaFn = useServerFn(listAuditMeta);
  const repsFn = useServerFn(listSalesReps);
  const markContactedFn = useServerFn(markRenewalContacted);

  useEffect(() => {
    if (open && spec) {
      const init: ReportFilters = { program_id: activeProgram?.id ?? "all" };
      if (spec.filters.some(f => f.type === "window")) init.window_days = 30;
      setFilters(init);
      setLastUrl(null); setWarning(null); setPresetName("");
      setShowPreview(false); setContactNotes({});
    }
  }, [open, reportCode]);

  const presetsQ = useQuery({
    queryKey: ["presets", reportCode],
    queryFn: () => listFn({ data: { report_code: reportCode! } }),
    enabled: open && !!reportCode,
  });

  // Load filter meta on demand
  const auditMetaQ = useQuery({
    queryKey: ["audit-meta"],
    queryFn: () => auditMetaFn(),
    enabled: open && reportCode === "actividad",
  });
  const repsQ = useQuery({
    queryKey: ["sales-reps"],
    queryFn: () => repsFn(),
    enabled: open && reportCode === "ventas",
  });

  const previewQ = useQuery({
    queryKey: ["preview", reportCode, filters],
    queryFn: () => previewFn({ data: { report_code: reportCode!, filters } }),
    enabled: open && showPreview && spec?.supports_preview === true,
  });

  const genMut = useMutation({
    mutationFn: (format: "csv" | "xlsx" | "pdf") =>
      generateFn({ data: { report_code: reportCode!, format, filters } }),
    onSuccess: (res: any) => {
      setLastUrl(res.url);
      setWarning(res.warning ?? null);
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

  const contactMut = useMutation({
    mutationFn: (vars: { policy_id: string; notes: string }) =>
      markContactedFn({ data: vars }),
    onSuccess: () => { toast.success("Contacto registrado"); previewQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (!spec) return null;
  const set = (k: string, v: any) => setFilters((p) => ({ ...p, [k]: v }));
  const toggleMulti = (k: string, v: string) => setFilters((p) => {
    const arr: string[] = Array.isArray(p[k]) ? p[k] : [];
    return { ...p, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  });

  const renderFilter = (f: FilterSpec) => {
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
    if (f.type === "text") {
      return (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Input value={filters[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder="Filtrar…" />
        </div>
      );
    }
    if (f.type === "date_range") {
      return (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={filters.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} />
            <Input type="date" value={filters.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} />
          </div>
        </div>
      );
    }
    if (f.type === "window") {
      return (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Select value={String(filters.window_days ?? 30)} onValueChange={(v) => set("window_days", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7,15,30,60,90].map(d => <SelectItem key={d} value={String(d)}>{d} días</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (f.type === "multi_select") {
      let options: { value: string; label: string }[] = f.options ?? [];
      if (f.key === "user_ids") options = (auditMetaQ.data?.users ?? []).map((u: any) => ({ value: u.id, label: u.full_name ?? u.id }));
      if (f.key === "actions") options = (auditMetaQ.data?.actions ?? []).map((a: string) => ({ value: a, label: a }));
      if (f.key === "sales_rep_ids") options = (repsQ.data ?? []).map((r: any) => ({ value: r.id, label: r.full_name }));
      const selected: string[] = Array.isArray(filters[f.key]) ? filters[f.key] : [];
      return (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal">
                {selected.length === 0 ? "Todos" : `${selected.length} seleccionado(s)`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <ScrollArea className="h-56 p-2">
                {options.length === 0 && <div className="text-xs text-muted-foreground p-2">Sin opciones</div>}
                {options.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 py-1 px-2 hover:bg-muted rounded cursor-pointer text-sm">
                    <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggleMulti(f.key, o.value)} />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      );
    }
    return null;
  };

  const previewRows = previewQ.data?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {spec.name}
            {spec.admin_only && <Badge variant="outline">Admin</Badge>}
          </DialogTitle>
          <DialogDescription>{spec.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {spec.filters.map(renderFilter)}
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
          <div className="flex gap-2 flex-wrap">
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
            {spec.supports_preview && (
              <Button variant="ghost" onClick={() => setShowPreview(v => !v)}>
                <Eye className="h-4 w-4 mr-2" /> {showPreview ? "Ocultar" : "Vista previa"}
              </Button>
            )}
          </div>
          {lastUrl && (
            <a href={lastUrl} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
              Volver a abrir <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {warning && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {warning}
          </div>
        )}

        {showPreview && spec.supports_preview && (
          <div className="border rounded-md mt-3">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
              {previewQ.isLoading ? "Cargando…" : `${previewQ.data?.total ?? 0} resultados (mostrando ${previewRows.length})`}
            </div>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead><TableHead>Folio</TableHead>
                    <TableHead>Vence</TableHead><TableHead className="text-right">Días</TableHead>
                    <TableHead>Estado</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r: any) => (
                    <TableRow key={r.policy_id}>
                      <TableCell className="text-xs">{r.client_name}</TableCell>
                      <TableCell className="text-xs font-mono">{r.folio}</TableCell>
                      <TableCell className="text-xs">{r.end_date}</TableCell>
                      <TableCell className="text-xs text-right">{r.days_to_expire}</TableCell>
                      <TableCell className="text-xs">
                        {r.renewal_status === "renewed" && <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Renovado</Badge>}
                        {r.renewal_status === "contacted" && <Badge variant="secondary" className="text-[10px]">Contactado</Badge>}
                        {r.renewal_status === "pending" && <Badge variant="outline" className="text-[10px]">Por contactar</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.renewal_status !== "renewed" && (
                          <div className="flex gap-1">
                            <Input
                              className="h-7 text-xs w-32"
                              placeholder="Nota (opcional)"
                              value={contactNotes[r.policy_id] ?? ""}
                              onChange={(e) => setContactNotes(p => ({ ...p, [r.policy_id]: e.target.value }))}
                            />
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => contactMut.mutate({ policy_id: r.policy_id, notes: contactNotes[r.policy_id] ?? "" })}
                              disabled={contactMut.isPending}>
                              Marcar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {previewRows.length === 0 && !previewQ.isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin resultados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
