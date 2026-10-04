import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileCheck2, Download, Upload, Loader2, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { useMyAccess, useAuthLevel } from "@/lib/use-my-access";
import { CertificateBadge } from "@/components/certificates/CertificateBadge";
import { parseInsurerFile, type InsurerFile, type InsurerRow } from "@/lib/insurer-file-parser";
import { newWorkbook, styleHeader, downloadWorkbook, fullName, ageFrom, genderFromCurp, GENDER_LABEL, slugDate } from "@/lib/client-excel";
import { matchAll, matchRow } from "@/lib/insurer-match";
import { buildHirMovementsFile, downloadBlob, movementFromPolicy, HIR_DEFAULT_POLICY } from "@/lib/hir-movements";

export const Route = createFileRoute("/_authenticated/certificates")({
  head: () => ({ meta: [{ title: "Altas, bajas y certificados — ZEMGO" }] }),
  component: CertificatesPage,
});

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const today = () => new Date().toLocaleDateString("en-CA");
const fmtDate = (d?: string | null) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("es-MX") : "—");

/** Cut-off on the 10th: payments from the 11th of one month to the 10th of the next go to the next month's list. */
function cutoffKey(d: string) {
  const dt = new Date(d);
  let y = dt.getFullYear(), m = dt.getMonth();
  if (dt.getDate() > 10) { m++; if (m > 11) { m = 0; y++; } }
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `Corte 10 de ${MONTHS[m]} ${y}` };
}

function useCanWrite(programId?: string) {
  const { data: access } = useMyAccess();
  const { data: level } = useAuthLevel();
  if (level?.isSuperAdmin) return true;
  const row = access?.find((a) => a.program_id === programId);
  return !!row && ["admin", "manager"].includes(row.role);
}

async function fetchProgramPolicies(programId: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("policies")
      .select("id, folio, policy_number, certificate_number, status, created_at, issue_date, program_id, company_id, metadata, companies(legal_name), clients(id, first_name, last_name, curp, rfc, date_of_birth, gender, metadata), payments(status, paid_at), dependents(full_name, relationship, date_of_birth, metadata)")
      .eq("program_id", programId)
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Número de póliza de la aseguradora para el archivo: el más común entre los renglones (o el de la plantilla). */
function policyNumberFor(rows: any[]) {
  const counts = new Map<string, number>();
  for (const p of rows) { const n = String(p.policy_number ?? p.metadata?.hir_policy ?? "").trim(); if (/^\d{8,}$/.test(n)) counts.set(n, (counts.get(n) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? HIR_DEFAULT_POLICY;
}

function CertificatesPage() {
  const { activeProgram } = useProgram();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileCheck2 className="h-6 w-6" style={{ color: "var(--program-primary)" }} /> Altas, bajas y certificados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Descarga las altas y bajas en el formato de HIR para enviarlas a la aseguradora, y sube la relación de asegurados (PDF) que regresa HIR para asignar los números de certificado.
        </p>
      </div>
      {!activeProgram ? (
        <Card className="p-8 text-center text-muted-foreground">Selecciona un programa.</Card>
      ) : (
        <Tabs defaultValue="altas">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="altas">1. Altas para HIR</TabsTrigger>
            <TabsTrigger value="bajas">2. Bajas para HIR</TabsTrigger>
            <TabsTrigger value="upload">3. Subir relación de HIR (PDF)</TabsTrigger>
          </TabsList>
          <TabsContent value="altas" className="mt-4"><AltasTab program={activeProgram} /></TabsContent>
          <TabsContent value="bajas" className="mt-4"><BajasTab program={activeProgram} /></TabsContent>
          <TabsContent value="upload" className="mt-4"><UploadTab program={activeProgram} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

async function markSent(programId: string, ids: string[], kind: "alta" | "baja", movementDate: string, fileName: string) {
  const { error } = await supabase.rpc("mark_insurer_movements_sent" as any, {
    _program_id: programId, _policy_ids: ids, _kind: kind, _movement_date: movementDate, _file_name: fileName,
  });
  if (error) throw error;
}

function SentBadge({ info }: { info?: any }) {
  if (!info) return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Por enviar</Badge>;
  return <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800">Enviada {fmtDate(info.at)}</Badge>;
}

// ------------------------------------------------------------------ 1. ALTAS

function AltasTab({ program }: { program: any }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite(program.id);
  const { data = [], isLoading } = useQuery({
    queryKey: ["cert-pending", program.id],
    queryFn: async () => {
      const pols = await fetchProgramPolicies(program.id);
      return pols
        .filter((p) => !String(p.certificate_number ?? "").trim() && p.status !== "cancelled")
        .map((p) => {
          const paid = (p.payments ?? []).filter((x: any) => x.status === "paid" && x.paid_at).map((x: any) => x.paid_at).sort();
          return { ...p, first_paid: paid[0] ?? null };
        })
        // Individuales: cuando ya pagaron. Empresas: la empresa paga en bloque, entran al darse de alta.
        .filter((p) => p.first_paid || p.company_id);
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: any[] }>();
    for (const p of data) {
      const { key, label } = p.company_id
        ? { key: `empresa-${p.company_id}`, label: `Empresa: ${p.companies?.legal_name ?? "sin nombre"}` }
        : { ...cutoffKey(p.first_paid), label: `Individuales · ${cutoffKey(p.first_paid).label}` };
      if (!m.has(key)) m.set(key, { label, rows: [] });
      m.get(key)!.rows.push(p);
    }
    return [...m.entries()].sort((a, b) =>
      a[0].startsWith("empresa-") !== b[0].startsWith("empresa-") ? (a[0].startsWith("empresa-") ? -1 : 1) : b[0].localeCompare(a[0]));
  }, [data]);

  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [movDate, setMovDate] = useState(today);
  const [busy, setBusy] = useState(false);
  // Por defecto se seleccionan las que aún no se han enviado.
  useEffect(() => { setSel(Object.fromEntries(data.map((p: any) => [p.id, !p.metadata?.insurer_alta_sent]))); }, [data]);
  const chosen = data.filter((p: any) => sel[p.id]);
  const porEnviar = data.filter((p: any) => !p.metadata?.insurer_alta_sent).length;

  async function downloadHir() {
    if (chosen.length === 0) return toast.error("Selecciona al menos una alta.");
    setBusy(true);
    try {
      const movs = chosen.map((p: any) => movementFromPolicy(p, "ALTA", movDate));
      const missing = movs.filter((m) => !m.date_of_birth || !m.sexo || !m.paterno).length;
      const blob = await buildHirMovementsFile(movs, { policyNumber: policyNumberFor(chosen) });
      const fileName = `ALTAS ${program.code} ${movDate}.xlsx`;
      downloadBlob(blob, fileName);
      if (canWrite) {
        await markSent(program.id, chosen.map((p: any) => p.id), "alta", movDate, fileName);
        await qc.invalidateQueries({ queryKey: ["cert-pending", program.id] });
      }
      toast.success(`Archivo de altas con ${movs.length} asegurado(s) descargado.${missing ? ` Revisa ${missing} renglón(es) con datos incompletos.` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el archivo");
    } finally { setBusy(false); }
  }

  async function downloadGeneral() {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet("Altas");
    ws.columns = ["Apellidos y nombre","CURP","RFC","Fecha de nacimiento","Sexo","Edad","Parentesco","No. empleado","Empresa","Fecha de alta","Póliza","Programa","Folio interno"].map((h) => ({ header: h, key: h }));
    for (const p of chosen) {
      const c = p.clients ?? {};
      const alta = p.first_paid ?? p.issue_date ?? p.created_at;
      ws.addRow([
        fullName(c), c.curp ?? "", c.rfc ?? (c.curp ?? "").slice(0, 10), c.date_of_birth ?? "",
        c.gender ? GENDER_LABEL[c.gender] ?? c.gender : genderFromCurp(c.curp), ageFrom(c.date_of_birth) ?? "",
        "Titular", c.metadata?.employee_number ?? "", p.companies?.legal_name ?? "",
        alta ? new Date(alta).toLocaleDateString("es-MX") : "", p.policy_number ?? "", program.name, p.folio,
      ]);
      for (const d of p.dependents ?? []) {
        const dc = d.metadata?.curp ?? "";
        ws.addRow([
          d.full_name, dc, dc.slice(0, 10), d.date_of_birth ?? "",
          d.metadata?.gender ? GENDER_LABEL[d.metadata.gender] ?? d.metadata.gender : genderFromCurp(dc), ageFrom(d.date_of_birth) ?? "",
          d.relationship ?? "Dependiente", c.metadata?.employee_number ?? "", p.companies?.legal_name ?? "",
          alta ? new Date(alta).toLocaleDateString("es-MX") : "", p.policy_number ?? "", program.name, p.folio,
        ]);
      }
    }
    styleHeader(ws);
    ws.getColumn(1).width = 38;
    await downloadWorkbook(wb, `altas-listado-${program.code}-${slugDate()}.xlsx`);
  }

  const toggleGroup = (rows: any[], v: boolean) => setSel((s) => ({ ...s, ...Object.fromEntries(rows.map((p) => [p.id, v])) }));

  return (
    <Card className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Todos los asegurados nuevos del programa que aún no tienen número de certificado: altas de empresas y clientes individuales que ya pagaron.
        El archivo sale en el formato de HIR (ALTAS) y las altas quedan marcadas como <b>enviadas</b> hasta que subas la relación de HIR con su número.
      </p>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fecha de movimiento</label>
          <Input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} className="w-[170px]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={downloadGeneral} disabled={chosen.length === 0}>Listado general (Excel)</Button>
          <Button onClick={downloadHir} disabled={busy || chosen.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar altas para HIR ({chosen.length})
          </Button>
        </div>
      </div>
      {!canWrite && <p className="text-xs text-amber-700">Puedes descargar el archivo, pero solo administradores o gerentes del programa lo marcan como enviado.</p>}
      {data.length > 0 && <p className="text-xs text-muted-foreground">{porEnviar} por enviar · {data.length - porEnviar} enviadas esperando certificado</p>}
      {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> :
        groups.length === 0 ? <div className="py-8 text-center text-muted-foreground">No hay altas pendientes de certificado.</div> :
        groups.map(([k, g]) => (
          <div key={k} className="space-y-2">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Checkbox checked={g.rows.every((p) => sel[p.id])} onCheckedChange={(v) => toggleGroup(g.rows, !!v)} />
              {g.label} <Badge variant="secondary">{g.rows.length}</Badge>
            </h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead /><TableHead>Nombre</TableHead><TableHead>CURP</TableHead><TableHead>Nacimiento</TableHead><TableHead>Folio</TableHead><TableHead>Alta / primer pago</TableHead><TableHead>Envío a HIR</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {g.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><Checkbox checked={!!sel[p.id]} onCheckedChange={(v) => setSel((s) => ({ ...s, [p.id]: !!v }))} /></TableCell>
                    <TableCell>{fullName(p.clients)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.clients?.curp}</TableCell>
                    <TableCell className="text-xs">{p.clients?.date_of_birth ? fmtDate(p.clients.date_of_birth) : <span className="text-amber-700">Falta</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{p.folio}</TableCell>
                    <TableCell>{new Date(p.first_paid ?? p.issue_date ?? p.created_at).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell><SentBadge info={p.metadata?.insurer_alta_sent} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </Card>
  );
}

// ------------------------------------------------------------------ 2. BAJAS

function BajasTab({ program }: { program: any }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite(program.id);
  const [showSent, setShowSent] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["cert-bajas", program.id],
    queryFn: async () => {
      const pols = await fetchProgramPolicies(program.id);
      // Bajas que la aseguradora necesita: certificados cancelados que ya tenían número.
      return pols
        .filter((p) => p.status === "cancelled" && String(p.certificate_number ?? "").trim())
        .sort((a, b) => String(b.metadata?.cancellation?.date ?? b.updated_at ?? "").localeCompare(String(a.metadata?.cancellation?.date ?? a.updated_at ?? "")));
    },
  });
  const pending = data.filter((p: any) => !p.metadata?.insurer_baja_sent);
  const sent = data.filter((p: any) => p.metadata?.insurer_baja_sent);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [movDate, setMovDate] = useState(today);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSel(Object.fromEntries(data.map((p: any) => [p.id, !p.metadata?.insurer_baja_sent]))); }, [data]);
  const chosen = data.filter((p: any) => sel[p.id]);

  async function downloadHir() {
    if (chosen.length === 0) return toast.error("Selecciona al menos una baja.");
    setBusy(true);
    try {
      const movs = chosen.map((p: any) => movementFromPolicy(p, "BAJA", movDate));
      const blob = await buildHirMovementsFile(movs, { policyNumber: policyNumberFor(chosen) });
      const fileName = `BAJAS ${program.code} ${movDate}.xlsx`;
      downloadBlob(blob, fileName);
      if (canWrite) {
        await markSent(program.id, chosen.map((p: any) => p.id), "baja", movDate, fileName);
        await qc.invalidateQueries({ queryKey: ["cert-bajas", program.id] });
      }
      toast.success(`Archivo de bajas con ${movs.length} asegurado(s) descargado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el archivo");
    } finally { setBusy(false); }
  }

  const rows = showSent ? data : pending;
  return (
    <Card className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Asegurados dados de baja en Zemgo (actualización mensual de la empresa, cancelaciones) que ya tenían certificado de HIR.
        El archivo sale en el formato de HIR (BAJAS) con su número de certificado.
      </p>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fecha de movimiento</label>
            <Input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} className="w-[170px]" />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Checkbox checked={showSent} onCheckedChange={(v) => setShowSent(!!v)} /> Mostrar ya enviadas ({sent.length})
          </label>
        </div>
        <Button onClick={downloadHir} disabled={busy || chosen.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Descargar bajas para HIR ({chosen.length})
        </Button>
      </div>
      {!canWrite && <p className="text-xs text-amber-700">Puedes descargar el archivo, pero solo administradores o gerentes del programa lo marcan como enviado.</p>}
      {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> :
        rows.length === 0 ? <div className="py-8 text-center text-muted-foreground">No hay bajas por enviar.</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead /><TableHead>N° Cert.</TableHead><TableHead>Nombre</TableHead><TableHead>Empresa</TableHead><TableHead>Motivo</TableHead><TableHead>Fecha de baja</TableHead><TableHead>Envío a HIR</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><Checkbox checked={!!sel[p.id]} onCheckedChange={(v) => setSel((s) => ({ ...s, [p.id]: !!v }))} /></TableCell>
                  <TableCell className="font-mono">{p.certificate_number}</TableCell>
                  <TableCell>{fullName(p.clients)}</TableCell>
                  <TableCell className="text-xs">{p.companies?.legal_name ?? "Individual"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.metadata?.cancellation?.reason ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(p.metadata?.cancellation?.date)}</TableCell>
                  <TableCell><SentBadge info={p.metadata?.insurer_baja_sent} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
    </Card>
  );
}

// ------------------------------------------------------------------ 3. SUBIR RELACIÓN DE HIR

type Match = { row: InsurerRow; policy: any; include: boolean; how: string };
type Ambig = { row: InsurerRow; options: any[]; chosen: string };

function UploadTab({ program }: { program: any }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite(program.id);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<InsurerFile | null>(null);
  const [policyNumber, setPolicyNumber] = useState("");
  const [matched, setMatched] = useState<Match[]>([]);
  const [unmatched, setUnmatched] = useState<InsurerRow[]>([]);
  const [ambig, setAmbig] = useState<Ambig[]>([]);
  const [hirButCancelled, setHirButCancelled] = useState<{ row: InsurerRow; policy: any }[]>([]);
  const [notInHir, setNotInHir] = useState<any[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  async function analyze(f: File) {
    setBusy(true); setFile(f);
    try {
      const res = await parseInsurerFile(f);
      if (res.rows.length === 0) throw new Error("No se encontraron renglones de asegurados en el archivo.");
      const all = await fetchProgramPolicies(program.id);
      const active = all.filter((p) => p.status !== "cancelled"); // las bajas no reciben certificado
      const cancelled = all.filter((p) => p.status === "cancelled");
      const m: Match[] = [], u: InsurerRow[] = [], a: Ambig[] = [], hc: { row: InsurerRow; policy: any }[] = [];
      const results = matchAll(res.rows, active);
      for (const row of res.rows) {
        const r = results.get(row) ?? {};
        if (r.policy) { m.push({ row, policy: r.policy, include: true, how: r.how! }); continue; }
        if (r.options?.length) { a.push({ row, options: r.options, chosen: "" }); continue; }
        const c = matchRow(row, cancelled);
        if (c.policy) { hc.push({ row, policy: c.policy }); continue; }
        u.push(row);
      }
      // Certificados vigentes en Zemgo (de esta póliza) que HIR ya no lista.
      const listed = new Set(res.rows.map((r) => r.certificate_number));
      const pol = (res.policy_number ?? "").trim();
      const missing = active.filter((p) => String(p.certificate_number ?? "").trim() && !listed.has(String(p.certificate_number))
        && (!pol || String(p.policy_number ?? "") === pol));
      setParsed(res); setPolicyNumber(res.policy_number ?? ""); setMatched(m); setUnmatched(u); setAmbig(a);
      setHirButCancelled(hc); setNotInHir(missing);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
      setParsed(null);
    } finally { setBusy(false); }
  }

  // Aviso si el archivo trae un número de póliza distinto al de los certificados emparejados (p. ej. el PDF de Vida).
  const matchedPolicyNumbers = [...new Set(matched.map((x) => x.policy.policy_number).filter(Boolean))];
  const policyMismatch = !!policyNumber.trim() && matchedPolicyNumbers.length > 0 && !matchedPolicyNumbers.includes(policyNumber.trim());

  const isNew = (x: Match) => String(x.policy.certificate_number ?? "") !== x.row.certificate_number;
  const nuevos = matched.filter((x) => isNew(x) && !String(x.policy.certificate_number ?? "").trim());
  const conflicts = matched.filter((x) => x.include && x.policy.certificate_number && String(x.policy.certificate_number) !== x.row.certificate_number).length
    + ambig.filter((x) => { const p = x.options.find((o) => o.id === x.chosen); return p?.certificate_number && String(p.certificate_number) !== x.row.certificate_number; }).length;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? matched : matched.filter(isNew);

  async function confirm() {
    const item = (row: InsurerRow, policy_id: string) => ({
      policy_id, certificate_number: row.certificate_number, alta_date: row.alta_date, rfc: row.rfc,
      insurer_premium: row.insurer_premium ?? null, insurer_premium_detail: row.insurer_premium_detail ?? null,
    });
    const items = [
      ...matched.filter((x) => x.include).map((x) => item(x.row, x.policy.id)),
      ...ambig.filter((x) => x.chosen).map((x) => item(x.row, x.chosen)),
    ];
    if (items.length === 0) return toast.error("No hay renglones seleccionados.");
    if (conflicts > 0 && overwrite && !window.confirm(`Se sobrescribirán ${conflicts} números de certificado existentes. ¿Continuar?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("apply_certificate_assignments" as any, {
      _program_id: program.id, _policy_number: policyNumber.trim(), _items: items, _file_name: file?.name ?? null, _overwrite: overwrite,
    });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "Solo administradores o gerentes del programa pueden asignar certificados." : error.message);
    const r = data as any;
    toast.success(`${nuevos.length} certificados nuevos asignados (${r.applied} renglones confirmados)${r.skipped ? `, ${r.skipped} omitidos` : ""}${r.rfc_updated ? ` · ${r.rfc_updated} RFC completados` : ""}.`);
    setParsed(null); setFile(null); setMatched([]); setAmbig([]); setUnmatched([]); setHirButCancelled([]); setNotInHir([]);
    qc.invalidateQueries();
  }

  return (
    <Card className="p-4 space-y-4">
      {!canWrite && <p className="text-sm text-amber-700">Solo administradores o gerentes del programa pueden guardar asignaciones.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Input type="file" accept=".pdf,.xlsx,.xls,.csv" className="max-w-sm" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ""; }} />
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Sube el PDF "Relación de Asegurados" que manda HIR (lista completa de la póliza). Se asigna el número de certificado a cada alta,
        se completa el RFC con homoclave y se avisa de cualquier diferencia entre HIR y Zemgo. También acepta un Excel/CSV con columnas N° Certificado, Nombre, RFC y Fecha de Alta.
      </p>

      {parsed && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Número de póliza</label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="w-[220px] font-mono" />
            </div>
            <Badge variant="secondary">{parsed.rows.length} asegurados en el archivo</Badge>
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{nuevos.length} certificados nuevos por asignar</Badge>
            <Badge variant="outline">{matched.length - nuevos.length} ya coinciden</Badge>
          </div>
          {policyMismatch && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              El archivo es de la póliza <b className="font-mono">{policyNumber}</b>, pero los certificados emparejados son de la póliza{" "}
              <b className="font-mono">{matchedPolicyNumbers.join(", ")}</b>. Revisa que sea el archivo correcto (por ejemplo, que no sea el de Vida).
            </p>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{showAll ? `Todos los emparejados (${matched.length})` : `Certificados nuevos o distintos (${visible.length})`}</h3>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} /> Ver también los que ya coinciden</label>
            </div>
            {visible.length === 0 ? <p className="text-sm text-muted-foreground">No hay certificados nuevos en este archivo.</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead /><TableHead>N° Cert.</TableHead><TableHead>Nombre (HIR)</TableHead><TableHead>RFC (HIR)</TableHead><TableHead>Cliente en Zemgo</TableHead><TableHead>Actual</TableHead><TableHead>Coincidió por</TableHead><TableHead>Alta HIR</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {visible.map((x) => {
                    const i = matched.indexOf(x);
                    return (
                      <TableRow key={i}>
                        <TableCell><Checkbox checked={x.include} onCheckedChange={(v) => setMatched((p) => p.map((y, j) => j === i ? { ...y, include: !!v } : y))} /></TableCell>
                        <TableCell className="font-mono">{x.row.certificate_number}</TableCell>
                        <TableCell className="text-xs">{x.row.name}</TableCell>
                        <TableCell className="font-mono text-xs">{x.row.rfc}</TableCell>
                        <TableCell>{fullName(x.policy.clients)}<div className="text-[11px] text-muted-foreground">{x.policy.companies?.legal_name ?? "Individual"}</div></TableCell>
                        <TableCell><CertificateBadge number={x.policy.certificate_number} /></TableCell>
                        <TableCell className="text-xs">{x.how}</TableCell>
                        <TableCell className="text-xs">{fmtDate(x.row.alta_date)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          {ambig.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-medium">Por confirmar — elige el cliente ({ambig.length})</h3>
              {ambig.map((x, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 text-sm border rounded-md p-2">
                  <span className="font-mono">N° {x.row.certificate_number}</span>
                  <span>{x.row.name}</span><span className="font-mono text-xs">{x.row.rfc}</span>
                  <Select value={x.chosen || "none"} onValueChange={(v) => setAmbig((p) => p.map((y, j) => j === i ? { ...y, chosen: v === "none" ? "" : v } : y))}>
                    <SelectTrigger className="w-[360px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No asignar</SelectItem>
                      {x.options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{fullName(o.clients)} · {o.folio}{o.certificate_number ? ` · cert ${o.certificate_number}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </section>
          )}

          {(hirButCancelled.length > 0 || notInHir.length > 0 || unmatched.length > 0) && (
            <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-3">
              <h3 className="font-medium flex items-center gap-2 text-amber-900"><AlertTriangle className="h-4 w-4" /> Diferencias entre HIR y Zemgo (no se cambia nada)</h3>
              {hirButCancelled.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">HIR los sigue teniendo, pero en Zemgo están dados de baja ({hirButCancelled.length})</p>
                  <ul className="text-sm list-disc pl-5">
                    {hirButCancelled.map(({ row, policy }, i) => (
                      <li key={i}>N° {row.certificate_number} — {row.name} · {policy.metadata?.insurer_baja_sent
                        ? <span className="text-muted-foreground">baja enviada el {fmtDate(policy.metadata.insurer_baja_sent.at)}; HIR aún no la aplica</span>
                        : <span className="text-amber-800">baja aún no enviada: aparece en "Bajas para HIR"</span>}</li>
                    ))}
                  </ul>
                </div>
              )}
              {notInHir.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Activos en Zemgo con certificado que HIR no lista ({notInHir.length})</p>
                  <ul className="text-sm list-disc pl-5">
                    {notInHir.map((p) => <li key={p.id}>N° {p.certificate_number} — {fullName(p.clients)} · {p.companies?.legal_name ?? "Individual"}</li>)}
                  </ul>
                </div>
              )}
              {unmatched.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">HIR los lista, pero no existen en Zemgo ({unmatched.length})</p>
                  <ul className="text-sm list-disc pl-5">
                    {unmatched.map((r, i) => <li key={i}>N° {r.certificate_number} — {r.name} — <span className="font-mono">{r.rfc}</span></li>)}
                  </ul>
                </div>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {conflicts > 0 ? (
              <label className="flex items-center gap-2 text-sm text-amber-700">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
                {conflicts} pólizas ya tienen otro número de certificado. Sobrescribirlos.
              </label>
            ) : <span />}
            <Button onClick={confirm} disabled={busy || !canWrite}><Upload className="h-4 w-4 mr-2" />Confirmar y asignar certificados</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
