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
import { buildHirMovementsFile, downloadBlob, movementFromPolicy, activeRowFromPolicy, HIR_DEFAULT_POLICY, HIR_VIDA_POLICY, HIR_VIDA_SUBGRUPO, HIR_VIDA_CATEGORIA } from "@/lib/hir-movements";

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
      .select("id, folio, policy_number, certificate_number, status, created_at, issue_date, start_date, end_date, program_id, company_id, metadata, companies(legal_name, group_type, coverage_start, coverage_end), clients(id, first_name, last_name, curp, rfc, date_of_birth, gender, metadata), payments(status, paid_at), dependents(full_name, relationship, date_of_birth, metadata)")
      .eq("program_id", programId)
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Torneo/equipo con vigencia menor a un año: alta al inicio y baja automática al terminar. */
function isShortGroup(p: any) {
  if (!p?.companies?.group_type || !p.start_date || !p.end_date) return false;
  const days = (Date.parse(String(p.end_date).slice(0, 10)) - Date.parse(String(p.start_date).slice(0, 10))) / 86400000;
  return days < 360;
}
const fmtShort = (d?: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";
/** Fecha de movimiento para HIR: torneos usan su inicio (alta) o fin de vigencia (baja). */
function movementDateFor(p: any, kind: "ALTA" | "BAJA", fallback: string) {
  if (!p?.companies?.group_type) return fallback;
  const d = kind === "ALTA" ? p.start_date : p.end_date;
  return d ? String(d).slice(0, 10) : fallback;
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
            <TabsTrigger value="activos">Activos y certificados</TabsTrigger>
          </TabsList>
          <TabsContent value="altas" className="mt-4"><AltasTab program={activeProgram} /></TabsContent>
          <TabsContent value="bajas" className="mt-4"><BajasTab program={activeProgram} /></TabsContent>
          <TabsContent value="upload" className="mt-4"><UploadTab program={activeProgram} /></TabsContent>
          <TabsContent value="activos" className="mt-4"><ActivosTab program={activeProgram} /></TabsContent>
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
        // Torneos/equipos: solo cuando el grupo (o el jugador) ya pagó y su certificado está vigente.
        .filter((p) => p.first_paid || (p.company_id && (!p.companies?.group_type || p.status === "active")));
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: any[] }>();
    for (const p of data) {
      const short = isShortGroup(p);
      const { key, label } = p.company_id
        ? {
            key: `${short ? "zcorta" : "empresa"}-${p.company_id}`,
            label: p.companies?.group_type
              ? `Torneo/equipo: ${p.companies?.legal_name ?? "sin nombre"} · vigencia ${fmtShort(p.start_date)} al ${fmtShort(p.end_date)}${short ? " · vigencia corta: alta con fecha de inicio y baja automática al terminar" : " · anual"}`
              : `Empresa: ${p.companies?.legal_name ?? "sin nombre"}`,
          }
        : { ...cutoffKey(p.first_paid), label: `Individuales · ${cutoffKey(p.first_paid).label}` };
      if (!m.has(key)) m.set(key, { label, rows: [] });
      m.get(key)!.rows.push(p);
    }
    // Empresas y torneos anuales primero, luego individuales, al final torneos de vigencia corta.
    const rank = (k: string) => (k.startsWith("empresa-") ? 0 : k.startsWith("zcorta-") ? 2 : 1);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[0].localeCompare(a[0]));
  }, [data]);

  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [movDate, setMovDate] = useState(today);
  const [busy, setBusy] = useState(false);
  // Por defecto vienen todas seleccionadas (también las ya enviadas que siguen sin certificado); se desmarcan a mano.
  useEffect(() => { setSel(Object.fromEntries(data.map((p: any) => [p.id, true]))); }, [data]);
  const chosen = data.filter((p: any) => sel[p.id]);
  const porEnviar = data.filter((p: any) => !p.metadata?.insurer_alta_sent).length;

  async function downloadHir() {
    if (chosen.length === 0) return toast.error("Selecciona al menos una alta.");
    setBusy(true);
    try {
      const movs = chosen.map((p: any) => movementFromPolicy(p, "ALTA", movementDateFor(p, "ALTA", movDate)));
      const missing = movs.filter((m) => !m.date_of_birth || !m.sexo || !m.paterno).length;
      const blob = await buildHirMovementsFile(movs, { policyNumber: policyNumberFor(chosen) });
      const fileName = `ALTAS ${program.code} ${movDate}.xlsx`;
      downloadBlob(blob, fileName);
      if (canWrite) {
        await markSent(program.id, chosen.map((p: any) => p.id), "alta", movDate, fileName);
        await qc.invalidateQueries({ queryKey: ["cert-pending", program.id] });
        await qc.invalidateQueries({ queryKey: ["cert-activos", program.id] });
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
        groups.map(([k, g], i) => (
          <div key={k} className="space-y-2">
            {k.startsWith("zcorta-") && !groups[i - 1]?.[0].startsWith("zcorta-") && (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <b>Torneos y equipos de vigencia corta (no anual).</b> Se envían en el mismo archivo de altas con su fecha de
                inicio de vigencia. El día que termina su vigencia aparecen solos en <b>2. Bajas para HIR</b>.
              </div>
            )}
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
                    <TableCell>
                      {p.companies?.group_type
                        ? <span className="text-xs">Alta HIR: {fmtShort(movementDateFor(p, "ALTA", movDate))}</span>
                        : new Date(p.first_paid ?? p.issue_date ?? p.created_at).toLocaleDateString("es-MX")}
                    </TableCell>
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
  const { data = [], isLoading } = useQuery({
    queryKey: ["cert-bajas", program.id],
    queryFn: async () => {
      const pols = await fetchProgramPolicies(program.id);
      // Bajas que la aseguradora necesita: certificados cancelados que ya tenían número,
      // y torneos de vigencia corta cuya vigencia ya terminó (baja automática).
      const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
      return pols
        .filter((p) => String(p.certificate_number ?? "").trim() && (
          p.status === "cancelled" ||
          (isShortGroup(p) && String(p.end_date).slice(0, 10) < todayIso && p.status !== "cancelled")
        ))
        // Primero las que faltan por enviar, luego las ya enviadas; dentro de cada grupo, la más reciente primero.
        .sort((a, b) => Number(!!a.metadata?.insurer_baja_sent) - Number(!!b.metadata?.insurer_baja_sent)
          || String(b.metadata?.cancellation?.date ?? b.updated_at ?? "").localeCompare(String(a.metadata?.cancellation?.date ?? a.updated_at ?? "")));
    },
  });
  const pending = data.filter((p: any) => !p.metadata?.insurer_baja_sent);
  const sent = data.filter((p: any) => p.metadata?.insurer_baja_sent);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [movDate, setMovDate] = useState(today);
  const [busy, setBusy] = useState(false);
  // Se ven todas (por enviar y ya enviadas) y vienen todas seleccionadas; se desmarcan a mano.
  useEffect(() => { setSel(Object.fromEntries(data.map((p: any) => [p.id, true]))); }, [data]);
  const chosen = data.filter((p: any) => sel[p.id]);

  async function downloadHir() {
    if (chosen.length === 0) return toast.error("Selecciona al menos una baja.");
    setBusy(true);
    try {
      const movs = chosen.map((p: any) =>
        movementFromPolicy(p, "BAJA", p.status === "cancelled" ? movDate : movementDateFor(p, "BAJA", movDate)));
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

  const rows = data;
  const allSel = rows.length > 0 && rows.every((p: any) => sel[p.id]);
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
          <p className="text-xs text-muted-foreground pb-2">{pending.length} por enviar · {sent.length} ya enviadas</p>
        </div>
        <Button onClick={downloadHir} disabled={busy || chosen.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Descargar bajas para HIR ({chosen.length})
        </Button>
      </div>
      {!canWrite && <p className="text-xs text-amber-700">Puedes descargar el archivo, pero solo administradores o gerentes del programa lo marcan como enviado.</p>}
      {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> :
        rows.length === 0 ? <div className="py-8 text-center text-muted-foreground">No hay bajas.</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead><Checkbox checked={allSel} onCheckedChange={(v) => setSel(Object.fromEntries(rows.map((p: any) => [p.id, !!v])))} /></TableHead><TableHead>N° Cert.</TableHead><TableHead>Nombre</TableHead><TableHead>Empresa</TableHead><TableHead>Motivo</TableHead><TableHead>Fecha de baja</TableHead><TableHead>Envío a HIR</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><Checkbox checked={!!sel[p.id]} onCheckedChange={(v) => setSel((s) => ({ ...s, [p.id]: !!v }))} /></TableCell>
                  <TableCell className="font-mono">{p.certificate_number}</TableCell>
                  <TableCell>{fullName(p.clients)}</TableCell>
                  <TableCell className="text-xs">{p.companies?.legal_name ?? "Individual"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.status === "cancelled" ? (p.metadata?.cancellation?.reason ?? "—") : "Fin de vigencia del torneo"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.status === "cancelled" ? fmtDate(p.metadata?.cancellation?.date) : fmtShort(p.end_date)}
                  </TableCell>
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
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function resolveCancelled(policy: any, action: "reactivate" | "confirm") {
    const name = fullName(policy.clients);
    if (action === "reactivate" && !window.confirm(`¿Regresar a ${name} al sistema como activo?`)) return;
    if (action === "confirm" && !window.confirm(`¿Confirmar la baja de ${name}? Ya no aparecerá en esta lista.`)) return;
    setRowBusy(policy.id);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const meta = { ...(policy.metadata ?? {}) };
      let update: any;
      if (action === "reactivate") {
        const prev = { cancellation: meta.cancellation ?? null, insurer_baja_sent: meta.insurer_baja_sent ?? null };
        delete meta.cancellation; delete meta.insurer_baja_sent; delete meta.baja_confirmed;
        meta.reactivated = { at: now, by: auth.user?.id ?? null, reason: "HIR lo sigue listando", previous: prev };
        update = { status: "active", metadata: meta };
      } else {
        meta.baja_confirmed = { at: now, by: auth.user?.id ?? null };
        update = { metadata: meta };
      }
      const { error } = await supabase.from("policies").update(update).eq("id", policy.id);
      if (error) throw error;
      if (action === "reactivate" && policy.clients?.id) {
        await supabase.from("client_programs").update({ status: "active", cancelled_at: null })
          .eq("client_id", policy.clients.id).eq("program_id", program.id);
      }
      await supabase.from("audit_log").insert({
        user_id: auth.user?.id ?? null, program_id: program.id, entity_type: "policy", entity_id: policy.id,
        action: action === "reactivate" ? "reactivate_from_hir" : "confirm_baja", diff: { certificate_number: policy.certificate_number },
      });
      setHirButCancelled((l) => l.filter((x) => x.policy.id !== policy.id));
      toast.success(action === "reactivate" ? `${name} regresó al sistema.` : `Baja de ${name} confirmada.`);
      qc.invalidateQueries({ queryKey: ["cert-bajas", program.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar.");
    } finally { setRowBusy(null); }
  }

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
        if (c.policy) { if (!c.policy.metadata?.baja_confirmed) hc.push({ row, policy: c.policy }); continue; }
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
              <h3 className="font-medium flex items-center gap-2 text-amber-900"><AlertTriangle className="h-4 w-4" /> Diferencias entre HIR y Zemgo</h3>
              {hirButCancelled.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">HIR los sigue teniendo, pero en Zemgo están dados de baja ({hirButCancelled.length})</p>
                  <p className="text-xs text-muted-foreground">Decide qué hacer con cada uno: <b>Regresar al sistema</b> los vuelve a activar con su certificado; <b>Confirmar baja</b> los deja fuera y ya no volverán a aparecer aquí.</p>
                  <div className="space-y-1">
                    {hirButCancelled.map(({ row, policy }) => (
                      <div key={policy.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                        <div>
                          N° {row.certificate_number} — {row.name}{" "}
                          {policy.metadata?.insurer_baja_sent
                            ? <span className="text-muted-foreground">· baja enviada el {fmtDate(policy.metadata.insurer_baja_sent.at)}</span>
                            : <span className="text-amber-800">· baja aún no enviada a HIR</span>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={!canWrite || rowBusy === policy.id} onClick={() => resolveCancelled(policy, "reactivate")}>Regresar al sistema</Button>
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/40" disabled={!canWrite || rowBusy === policy.id} onClick={() => resolveCancelled(policy, "confirm")}>Confirmar baja</Button>
                        </div>
                      </div>
                    ))}
                  </div>
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

// ------------------------------------------------------------------ ACTIVOS Y CERTIFICADOS

/** Asegurados vigentes del programa (no dados de baja), con y sin número de certificado de HIR. */
function ActivosTab({ program }: { program: any }) {
  const query = useQuery({
    queryKey: ["cert-activos", program.id],
    queryFn: async () => {
      const pols = await fetchProgramPolicies(program.id);
      const cancelled = pols.filter((p) => p.status === "cancelled" && String(p.certificate_number ?? "").trim());
      const active = pols
        .filter((p) => p.status !== "cancelled")
        .filter((p) => {
          if (String(p.certificate_number ?? "").trim()) return true;
          // Mismo criterio que "Altas para HIR": individuales ya pagados, empresas al darse de alta, torneos activos.
          const paid = (p.payments ?? []).some((x: any) => x.status === "paid" && x.paid_at);
          return paid || (p.company_id && (!p.companies?.group_type || p.status === "active"));
        });
      return { active, cancelled };
    },
  });
  const data = query.data?.active ?? [];
  const cancelled = query.data?.cancelled ?? [];
  const isLoading = query.isLoading;
  const [estado, setEstado] = useState<"todos" | "con" | "sin">("todos");
  const [empresa, setEmpresa] = useState("todas");
  const [q, setQ] = useState("");

  const hasCert = (p: any) => !!String(p.certificate_number ?? "").trim();
  const empresas = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data) m.set(p.company_id ?? "individual", p.companies?.legal_name ?? "Individuales");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const inEmpresa = data.filter((p: any) => empresa === "todas" || (p.company_id ?? "individual") === empresa);
  const conCert = inEmpresa.filter(hasCert).length;
  const qn = q.trim().toUpperCase();
  const rows = inEmpresa
    .filter((p: any) => estado === "todos" || (estado === "con" ? hasCert(p) : !hasCert(p)))
    .filter((p: any) => !qn || `${fullName(p.clients)} ${p.clients?.curp ?? ""} ${p.certificate_number ?? ""}`.toUpperCase().includes(qn))
    .sort((a: any, b: any) => Number(hasCert(a)) - Number(hasCert(b))
      || String(a.companies?.legal_name ?? "").localeCompare(String(b.companies?.legal_name ?? ""))
      || fullName(a.clients).localeCompare(fullName(b.clients)));

  async function exportExcel() {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet("Activos");
    ws.columns = ["Apellidos y nombre","CURP","Fecha de nacimiento","No. empleado","Empresa","N° Certificado","Estado HIR","Póliza","Folio interno"].map((h) => ({ header: h, key: h }));
    for (const p of rows) {
      const c = p.clients ?? {};
      ws.addRow([
        fullName(c), c.curp ?? "", c.date_of_birth ?? "", c.metadata?.employee_number ?? "", p.companies?.legal_name ?? "Individual",
        p.certificate_number ?? "", hasCert(p) ? "Con certificado" : p.metadata?.insurer_alta_sent ? "Alta enviada, sin certificado" : "Sin certificado (alta por enviar)",
        p.policy_number ?? "", p.folio,
      ]);
    }
    styleHeader(ws);
    ws.getColumn(1).width = 38;
    await downloadWorkbook(wb, `activos-${program.code}-${slugDate()}.xlsx`);
  }

  // ---- Listado completo para la póliza de Vida (formato HIR)
  const [vidaDate, setVidaDate] = useState(today);
  const [vidaBusy, setVidaBusy] = useState(false);
  const vidaMonth = vidaDate.slice(0, 7);
  const inScope = (p: any) => empresa === "todas" || (p.company_id ?? "individual") === empresa;
  const bajaDate = (p: any) => String(p.metadata?.cancellation?.date ?? p.updated_at ?? "").slice(0, 10);
  const vidaBajas = cancelled.filter((p: any) => inScope(p) && bajaDate(p).slice(0, 7) === vidaMonth);
  const certNum = (p: any) => Number(String(p.certificate_number).replace(/\D/g, "")) || 0;

  async function downloadVida() {
    setVidaBusy(true);
    try {
      const con = inEmpresa.filter(hasCert).sort((a: any, b: any) => certNum(a) - certNum(b));
      const sin = inEmpresa.filter((p: any) => !hasCert(p)).sort((a: any, b: any) => fullName(a.clients).localeCompare(fullName(b.clients)));
      const movs = [
        ...con.map((p: any) => activeRowFromPolicy(p, vidaDate)),
        ...sin.map((p: any) => movementFromPolicy(p, "ALTA", vidaDate)),
        ...vidaBajas.map((p: any) => movementFromPolicy(p, "BAJA", bajaDate(p) || vidaDate)),
      ];
      const blob = await buildHirMovementsFile(movs, { policyNumber: HIR_VIDA_POLICY, subgrupo: HIR_VIDA_SUBGRUPO, categoria: HIR_VIDA_CATEGORIA });
      downloadBlob(blob, `VIDA ${HIR_VIDA_POLICY} ${program.code} ${vidaDate}.xlsx`);
      toast.success(`Listado de Vida: ${con.length} activos con certificado, ${sin.length} altas y ${vidaBajas.length} bajas.`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el archivo");
    } finally { setVidaBusy(false); }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="rounded-md border p-3 space-y-2">
        <h3 className="font-medium text-sm">Póliza de Vida {HIR_VIDA_POLICY} — listado completo (formato HIR)</h3>
        <p className="text-xs text-muted-foreground">
          Arriba todos los activos con su número de certificado (ordenados por certificado), abajo las altas con el certificado vacío
          y al final las bajas del mes de la fecha de movimiento. Respeta el filtro de empresa. La póliza de AP ({HIR_DEFAULT_POLICY}) solo lleva
          altas y bajas: usa las pestañas 1 y 2.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fecha de movimiento</label>
            <Input type="date" value={vidaDate} onChange={(e) => setVidaDate(e.target.value)} className="w-[170px]" />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            {conCert} activos con certificado · {inEmpresa.length - conCert} altas · {vidaBajas.length} bajas de {vidaMonth}
          </p>
          <Button onClick={downloadVida} disabled={vidaBusy || isLoading || inEmpresa.length === 0}>
            {vidaBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar listado Vida
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Todos los asegurados que siguen activos en Zemgo: los que ya tienen su número de certificado de HIR y los que todavía no
        (altas por enviar o enviadas esperando la relación de HIR).
      </p>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Empresa</label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {empresas.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Certificado</label>
            <Select value={estado} onValueChange={(v) => setEstado(v as any)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos ({inEmpresa.length})</SelectItem>
                <SelectItem value="con">Con certificado ({conCert})</SelectItem>
                <SelectItem value="sin">Sin certificado ({inEmpresa.length - conCert})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, CURP o N° cert." className="w-[220px]" />
          </div>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Descargar Excel ({rows.length})
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{inEmpresa.length} activos</Badge>
        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{conCert} con certificado</Badge>
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">{inEmpresa.length - conCert} sin certificado</Badge>
      </div>
      {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> :
        rows.length === 0 ? <div className="py-8 text-center text-muted-foreground">No hay asegurados con ese filtro.</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>N° Cert.</TableHead><TableHead>Nombre</TableHead><TableHead>CURP</TableHead><TableHead>No. emp.</TableHead><TableHead>Empresa</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><CertificateBadge number={p.certificate_number} /></TableCell>
                  <TableCell>{fullName(p.clients)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.clients?.curp}</TableCell>
                  <TableCell className="text-xs">{p.clients?.metadata?.employee_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{p.companies?.legal_name ?? "Individual"}</TableCell>
                  <TableCell>
                    {hasCert(p)
                      ? <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Con certificado</Badge>
                      : p.metadata?.insurer_alta_sent
                        ? <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800">Alta enviada {fmtDate(p.metadata.insurer_alta_sent.at)} · sin certificado</Badge>
                        : <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Sin certificado · alta por enviar</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
    </Card>
  );
}
