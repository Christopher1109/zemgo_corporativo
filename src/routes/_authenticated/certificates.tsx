import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileCheck2, Download, Upload, Loader2 } from "lucide-react";
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
import { newWorkbook, styleHeader, downloadWorkbook, fullName, normalizeName, ageFrom, genderFromCurp, GENDER_LABEL, slugDate } from "@/lib/client-excel";

export const Route = createFileRoute("/_authenticated/certificates")({
  head: () => ({ meta: [{ title: "Asignación de certificados — ZEMGO" }] }),
  component: CertificatesPage,
});

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

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
      .select("id, folio, certificate_number, status, created_at, program_id, clients(id, first_name, last_name, curp, rfc, date_of_birth, gender), payments(status, paid_at)")
      .eq("program_id", programId)
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function CertificatesPage() {
  const { activeProgram } = useProgram();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileCheck2 className="h-6 w-6" style={{ color: "var(--program-primary)" }} /> Asignación de certificados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envía cada mes (corte al día 10) los clientes nuevos a la aseguradora y carga su respuesta para asignar los números de certificado.
        </p>
      </div>
      {!activeProgram ? (
        <Card className="p-8 text-center text-muted-foreground">Selecciona un programa.</Card>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pendientes</TabsTrigger>
            <TabsTrigger value="upload">Subir respuesta de la aseguradora</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4"><PendingTab program={activeProgram} /></TabsContent>
          <TabsContent value="upload" className="mt-4"><UploadTab program={activeProgram} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function PendingTab({ program }: { program: any }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["cert-pending", program.id],
    queryFn: async () => {
      const pols = await fetchProgramPolicies(program.id);
      return pols
        .filter((p) => !String(p.certificate_number ?? "").trim())
        .map((p) => {
          const paid = (p.payments ?? []).filter((x: any) => x.status === "paid" && x.paid_at).map((x: any) => x.paid_at).sort();
          return { ...p, first_paid: paid[0] ?? null };
        })
        .filter((p) => p.first_paid);
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: any[] }>();
    for (const p of data) {
      const { key, label } = cutoffKey(p.first_paid);
      if (!m.has(key)) m.set(key, { label, rows: [] });
      m.get(key)!.rows.push(p);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);
  const [sel, setSel] = useState<string>("all");
  const rows = sel === "all" ? data : groups.find(([k]) => k === sel)?.[1].rows ?? [];

  async function download() {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet("Altas");
    ws.columns = ["Apellidos y nombre","CURP","RFC","Fecha de nacimiento","Sexo","Edad","Fecha de primer pago","Programa","Folio interno"].map((h) => ({ header: h, key: h }));
    for (const p of rows) {
      const c = p.clients ?? {};
      ws.addRow([
        fullName(c), c.curp ?? "", (c.curp ?? "").slice(0, 10), c.date_of_birth ?? "",
        c.gender ? GENDER_LABEL[c.gender] ?? c.gender : genderFromCurp(c.curp), ageFrom(c.date_of_birth) ?? "",
        new Date(p.first_paid).toLocaleDateString("es-MX"), program.name, p.folio,
      ]);
    }
    styleHeader(ws);
    ws.getColumn(1).width = 38;
    await downloadWorkbook(wb, `altas-aseguradora-${program.code}-${sel}-${slugDate()}.xlsx`);
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Mes de alta</label>
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({data.length})</SelectItem>
              {groups.map(([k, g]) => <SelectItem key={k} value={k}>{g.label} ({g.rows.length})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={download} disabled={rows.length === 0}><Download className="h-4 w-4 mr-2" />Descargar Excel para aseguradora</Button>
      </div>
      {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> :
        groups.length === 0 ? <div className="py-8 text-center text-muted-foreground">No hay certificados pendientes con pago cobrado.</div> :
        groups.filter(([k]) => sel === "all" || k === sel).map(([k, g]) => (
          <div key={k} className="space-y-2">
            <h3 className="font-medium text-sm">{g.label} <Badge variant="secondary">{g.rows.length}</Badge></h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead><TableHead>CURP</TableHead><TableHead>Folio</TableHead><TableHead>Primer pago</TableHead><TableHead>Certificado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {g.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fullName(p.clients)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.clients?.curp}</TableCell>
                    <TableCell className="font-mono text-xs">{p.folio}</TableCell>
                    <TableCell>{new Date(p.first_paid).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell><CertificateBadge number={null} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </Card>
  );
}

type Match = { row: InsurerRow; policy: any; include: boolean };
type Ambig = { row: InsurerRow; options: any[]; chosen: string };

function nameScore(a: string, b: string) {
  const ta = new Set(normalizeName(a).split(" ")), tb = normalizeName(b).split(" ");
  return tb.filter((t) => t && ta.has(t)).length;
}

function UploadTab({ program }: { program: any }) {
  const qc = useQueryClient();
  const canWrite = useCanWrite(program.id);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<InsurerFile | null>(null);
  const [policyNumber, setPolicyNumber] = useState("");
  const [matched, setMatched] = useState<Match[]>([]);
  const [unmatched, setUnmatched] = useState<InsurerRow[]>([]);
  const [ambig, setAmbig] = useState<Ambig[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  async function analyze(f: File) {
    setBusy(true); setFile(f);
    try {
      const res = await parseInsurerFile(f);
      if (res.rows.length === 0) throw new Error("No se encontraron renglones de asegurados en el archivo.");
      const pols = await fetchProgramPolicies(program.id);
      const byKey = new Map<string, any[]>();
      for (const p of pols) {
        const k = (p.clients?.curp ?? "").toUpperCase().slice(0, 10);
        if (k.length < 10) continue;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(p);
      }
      const m: Match[] = [], u: InsurerRow[] = [], a: Ambig[] = [];
      for (const row of res.rows) {
        let cands = byKey.get(row.rfc.slice(0, 10)) ?? [];
        if (cands.length === 0) { u.push(row); continue; }
        // Group by client; prefer the policy without a certificate.
        const byClient = new Map<string, any[]>();
        for (const p of cands) { const id = p.clients?.id; if (!byClient.has(id)) byClient.set(id, []); byClient.get(id)!.push(p); }
        let clients = [...byClient.values()];
        if (clients.length > 1 && row.name) {
          const scored = clients.map((ps) => ({ ps, s: nameScore(row.name, fullName(ps[0].clients)) }));
          const best = Math.max(...scored.map((x) => x.s));
          clients = scored.filter((x) => x.s === best).map((x) => x.ps);
        }
        const flat = clients.flat().sort((x, y) => (x.certificate_number ? 1 : 0) - (y.certificate_number ? 1 : 0));
        const exact = flat.filter((p) => String(p.certificate_number ?? "") === row.certificate_number);
        if (exact.length === 1) { m.push({ row, policy: exact[0], include: true }); continue; }
        const free = flat.filter((p) => !String(p.certificate_number ?? "").trim());
        if (clients.length === 1 && (free.length <= 1 || flat.length === 1)) {
          m.push({ row, policy: free[0] ?? flat[0], include: true });
        } else {
          cands = flat;
          a.push({ row, options: cands, chosen: "" });
        }
      }
      setParsed(res); setPolicyNumber(res.policy_number ?? ""); setMatched(m); setUnmatched(u); setAmbig(a);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
      setParsed(null);
    } finally { setBusy(false); }
  }

  const conflicts = matched.filter((x) => x.include && x.policy.certificate_number && String(x.policy.certificate_number) !== x.row.certificate_number).length
    + ambig.filter((x) => { const p = x.options.find((o) => o.id === x.chosen); return p?.certificate_number && String(p.certificate_number) !== x.row.certificate_number; }).length;

  async function confirm() {
    const items = [
      ...matched.filter((x) => x.include).map((x) => ({ policy_id: x.policy.id, certificate_number: x.row.certificate_number, alta_date: x.row.alta_date })),
      ...ambig.filter((x) => x.chosen).map((x) => ({ policy_id: x.chosen, certificate_number: x.row.certificate_number, alta_date: x.row.alta_date })),
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
    toast.success(`${r.applied} certificados asignados${r.skipped ? `, ${r.skipped} omitidos (ya tenían certificado)` : ""}.`);
    setParsed(null); setFile(null); setMatched([]); setAmbig([]); setUnmatched([]);
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
      <p className="text-xs text-muted-foreground">Acepta el PDF "Relación de Asegurados" de HIR Seguros o un Excel/CSV con columnas N° Certificado, Nombre, RFC y Fecha de Alta.</p>

      {parsed && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Número de póliza</label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="w-[220px] font-mono" />
            </div>
            <Badge variant="secondary">{parsed.rows.length} renglones leídos</Badge>
          </div>

          <section className="space-y-2">
            <h3 className="font-medium">Emparejados ({matched.length})</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead /><TableHead>N° Cert.</TableHead><TableHead>Nombre (archivo)</TableHead><TableHead>RFC</TableHead><TableHead>Cliente</TableHead><TableHead>Folio</TableHead><TableHead>Actual</TableHead><TableHead>Alta</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {matched.map((x, i) => (
                  <TableRow key={i}>
                    <TableCell><Checkbox checked={x.include} onCheckedChange={(v) => setMatched((p) => p.map((y, j) => j === i ? { ...y, include: !!v } : y))} /></TableCell>
                    <TableCell className="font-mono">{x.row.certificate_number}</TableCell>
                    <TableCell className="text-xs">{x.row.name}</TableCell>
                    <TableCell className="font-mono text-xs">{x.row.rfc}</TableCell>
                    <TableCell>{fullName(x.policy.clients)}</TableCell>
                    <TableCell className="font-mono text-xs">{x.policy.folio}</TableCell>
                    <TableCell><CertificateBadge number={x.policy.certificate_number} /></TableCell>
                    <TableCell className="text-xs">{x.row.alta_date ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {ambig.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-medium">Ambiguos — elige el cliente ({ambig.length})</h3>
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

          {unmatched.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-medium">Sin coincidencia en el sistema ({unmatched.length})</h3>
              <ul className="text-sm text-muted-foreground list-disc pl-5">
                {unmatched.map((r, i) => <li key={i}>N° {r.certificate_number} — {r.name} — <span className="font-mono">{r.rfc}</span></li>)}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {conflicts > 0 ? (
              <label className="flex items-center gap-2 text-sm text-amber-700">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
                {conflicts} pólizas ya tienen otro número de certificado. Sobrescribirlos.
              </label>
            ) : <span />}
            <Button onClick={confirm} disabled={busy || !canWrite}><Upload className="h-4 w-4 mr-2" />Confirmar y guardar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
