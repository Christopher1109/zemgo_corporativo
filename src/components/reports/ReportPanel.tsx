import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, FileText, FileDown, Save, Loader2, ExternalLink, Trash2, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { REPORT_SPECS, type ReportFilters, type FilterSpec } from "@/lib/reports/types";
import {
  generateReport, listPresets, savePreset, deletePreset,
  previewReport, listAuditMeta, listSalesReps, markRenewalContacted,
} from "@/lib/reports.functions";
import { toast } from "sonner";

/**
 * Inline report panel (filters + export + optional preview).
 * Same logic as ReportModal but without the Dialog wrapper, so it can be
 * rendered directly under a Tabs tab.
 */
export function ReportPanel({ reportCode }: { reportCode: string }) {
  const spec = REPORT_SPECS[reportCode];
  const { programs, activeProgram } = useProgram();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [showPreview, setShowPreview] = useState(true);
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
    if (!spec) return;
    const init: ReportFilters = { program_id: activeProgram?.id ?? "all" };
    if (spec.filters.some(f => f.type === "window")) init.window_days = 30;
    // Por defecto: cargar los últimos 30 días en reportes con date_range,
    // excepto "cartera" (queremos toda la cartera vigente desde el inicio).
    if (reportCode !== "cartera" && spec.filters.some(f => f.type === "date_range")) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      init.date_from = from.toISOString().slice(0, 10);
      init.date_to = to.toISOString().slice(0, 10);
    }
    setFilters(init);
    setLastUrl(null); setWarning(null); setPresetName(""); setContactNotes({});
  }, [reportCode, activeProgram?.id]);

  const presetsQ = useQuery({
    queryKey: ["presets", reportCode],
    queryFn: () => listFn({ data: { report_code: reportCode } }),
  });

  const auditMetaQ = useQuery({
    queryKey: ["audit-meta"],
    queryFn: () => auditMetaFn(),
    enabled: reportCode === "actividad",
  });
  const repsQ = useQuery({
    queryKey: ["sales-reps"],
    queryFn: () => repsFn(),
    enabled: reportCode === "ventas",
  });

  const previewQ = useQuery({
    queryKey: ["preview", reportCode, filters],
    queryFn: () => previewFn({ data: { report_code: reportCode, filters } }),
    enabled: showPreview && spec?.supports_preview === true,
  });

  const genMut = useMutation({
    mutationFn: (format: "csv" | "xlsx" | "pdf") =>
      generateFn({ data: { report_code: reportCode, format, filters } }),
    onSuccess: (res: any) => {
      setLastUrl(res.url);
      setWarning(res.warning ?? null);
      toast.success(`Reporte generado (${res.rows_count} registros)`);
      window.open(res.url, "_blank");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo generar"),
  });

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { report_code: reportCode, name: presetName, filters } }),
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

  if (!spec) return <div className="text-sm text-muted-foreground">Reporte no disponible.</div>;
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {spec.name}
          {spec.admin_only && <Badge variant="outline">Admin</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">{spec.description}</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          {spec.filters.map(renderFilter)}
        </div>

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

        <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs">Guardar filtro</Label>
            <div className="flex gap-2">
              <Input placeholder="Nombre del preset" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={!presetName || saveMut.isPending}>
                <Save className="h-4 w-4 mr-2" /> Guardar
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap ml-auto">
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
                <Eye className="h-4 w-4 mr-2" /> {showPreview ? "Ocultar vista" : "Vista previa"}
              </Button>
            )}
          </div>
        </div>

        {warning && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {warning}
          </div>
        )}
        {lastUrl && (
          <a href={lastUrl} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            Volver a abrir último archivo <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </Card>

      {showPreview && spec.supports_preview && (
        <Card>
          <div className="px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
            {previewQ.isLoading ? "Cargando…" : `${previewQ.data?.total ?? 0} resultados (mostrando ${previewRows.length})`}
          </div>
          <div className="max-h-[480px] overflow-auto">
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
                            placeholder="Nota"
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
        </Card>
      )}
    </div>
  );
}
