import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import {
  fetchProgramClients, newWorkbook, styleHeader, downloadWorkbook, fullName, ageFrom, genderFromCurp,
  GENDER_LABEL, MARITAL_LABEL, slugDate,
} from "@/lib/client-excel";

const POLICY_STATUS: Record<string, string> = {
  draft: "Borrador", pending_payment: "Pendiente de pago", active: "Vigente", expired: "Vencido", cancelled: "Cancelado", suspended: "Suspendido",
};
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("es-MX") : "");
const addr = (c: any) => c.address_full || [c.street, c.number, c.colonia, c.city, c.state, c.zip].filter(Boolean).join(", ");

function payInfo(p: any) {
  const pays = p.payments ?? [];
  const last = pays.filter((x: any) => x.status === "paid" && x.paid_at).sort((a: any, b: any) => b.paid_at.localeCompare(a.paid_at))[0];
  const debt = pays.filter((x: any) => x.status === "overdue" || (x.status === "pending" && x.due_date && x.due_date < new Date().toISOString().slice(0, 10)))
    .reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
  return { last, debt };
}

type Field = { key: string; label: string; get: (c: any, p: any) => any };
export const FIELDS: Field[] = [
  { key: "curp", label: "CURP", get: (c) => c.curp },
  { key: "name", label: "Nombre", get: (c) => fullName(c) },
  { key: "sex", label: "Sexo", get: (c) => (c.gender ? GENDER_LABEL[c.gender] ?? c.gender : genderFromCurp(c.curp)) },
  { key: "first_name", label: "Nombre(s)", get: (c) => c.first_name },
  { key: "last_name", label: "Apellidos", get: (c) => c.last_name },
  { key: "rfc", label: "RFC", get: (c) => c.rfc || (c.curp ?? "").slice(0, 10) },
  { key: "dob", label: "Fecha de nacimiento", get: (c) => c.date_of_birth },
  { key: "age", label: "Edad", get: (c) => ageFrom(c.date_of_birth) },
  { key: "marital", label: "Estado civil", get: (c) => (c.marital_status ? MARITAL_LABEL[c.marital_status] ?? c.marital_status : "") },
  { key: "phone", label: "Teléfono", get: (c) => c.phone },
  { key: "phone_alt", label: "Teléfono alterno", get: (c) => c.phone_alt },
  { key: "email", label: "Email", get: (c) => c.email },
  { key: "address", label: "Domicilio", get: (c) => addr(c) },
  { key: "city", label: "Ciudad", get: (c) => c.city },
  { key: "state", label: "Estado", get: (c) => c.state },
  { key: "zip", label: "C.P.", get: (c) => c.zip },
  { key: "payer_name", label: "Responsable de pago", get: (c) => c.payer_name },
  { key: "payer_phone", label: "Celular del responsable", get: (c) => c.payer_phone },
  { key: "sales_rep", label: "Vendedor", get: (c) => c.sales_reps?.full_name },
  { key: "company", label: "Empresa", get: (c) => c.companies?.legal_name },
  { key: "folio", label: "Folio", get: (_c, p) => p?.folio },
  { key: "policy_number", label: "Número de póliza", get: (_c, p) => p?.policy_number },
  { key: "certificate", label: "N° Certificado", get: (_c, p) => p?.certificate_number },
  { key: "start", label: "Inicio de vigencia", get: (_c, p) => p?.start_date },
  { key: "end", label: "Fin de vigencia", get: (_c, p) => p?.end_date },
  { key: "pstatus", label: "Estatus del certificado", get: (_c, p) => (p ? POLICY_STATUS[p.status] ?? p.status : "") },
  { key: "alta", label: "Fecha de alta aseguradora", get: (_c, p) => p?.metadata?.insurer_alta_date },
  { key: "premium", label: "Prima", get: (_c, p) => (p?.premium != null ? Number(p.premium) : "") },
  { key: "last_pay", label: "Último pago", get: (_c, p) => (p ? fmt(payInfo(p).last?.paid_at) : "") },
  { key: "last_amount", label: "Monto último pago", get: (_c, p) => (p ? Number(payInfo(p).last?.amount ?? 0) || "" : "") },
  { key: "debt", label: "Adeudo", get: (_c, p) => (p ? payInfo(p).debt : "") },
];
const DEFAULT_KEYS = ["curp", "name", "sex"];

/** One row per certificate (or per client without certificates). */
function flatten(clients: any[]) {
  const out: Array<{ c: any; p: any }> = [];
  for (const c of clients) {
    if (!c.policies?.length) out.push({ c, p: null });
    else for (const p of c.policies) out.push({ c, p });
  }
  return out.sort((a, b) => fullName(a.c).localeCompare(fullName(b.c)));
}

async function exportFields(program: any, keys: string[], fileName: string, sheet: string) {
  const clients = await fetchProgramClients(program.id, true);
  const fields = FIELDS.filter((f) => keys.includes(f.key));
  const wb = await newWorkbook();
  const ws = wb.addWorksheet(sheet);
  ws.columns = fields.map((f) => ({ header: f.label, key: f.key }));
  for (const { c, p } of flatten(clients)) ws.addRow(fields.map((f) => f.get(c, p) ?? ""));
  styleHeader(ws);
  await downloadWorkbook(wb, fileName);
  return clients.length;
}

export function InternalPortfolioReport() {
  const { activeProgram } = useProgram();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!activeProgram) return;
    setBusy(true);
    try {
      const n = await exportFields(activeProgram, FIELDS.map((f) => f.key), `cartera-interna-${activeProgram.code}-${slugDate()}.xlsx`, "Cartera");
      toast.success(`Reporte generado con ${n} clientes.`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="p-6 space-y-3">
      <h2 className="font-semibold">Cartera – reporte interno</h2>
      <p className="text-sm text-muted-foreground">
        Excel con toda la información de los clientes de {activeProgram?.name ?? "el programa activo"}: datos personales, dirección, contacto,
        responsable de pago, vendedor, empresa, certificados (folio, número, vigencia, estatus) y resumen de pagos (último pago y adeudo).
      </p>
      <Button onClick={run} disabled={busy || !activeProgram}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Descargar Excel
      </Button>
    </Card>
  );
}

export function InsurerReport() {
  const { activeProgram, programs } = useProgram();
  const qc = useQueryClient();
  const [programId, setProgramId] = useState<string>(activeProgram?.id ?? "");
  useEffect(() => { if (!programId && activeProgram) setProgramId(activeProgram.id); }, [activeProgram, programId]);
  const program = programs.find((p) => p.id === programId);
  const [keys, setKeys] = useState<string[]>(DEFAULT_KEYS);
  const [templateId, setTemplateId] = useState<string>("new");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["insurer-templates", programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase.from("insurer_report_templates" as any).select("id, name, fields").eq("program_id", programId).order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) { setKeys(t.fields ?? DEFAULT_KEYS); setName(t.name); } else { setKeys(DEFAULT_KEYS); setName(""); }
  }

  async function save() {
    if (!name.trim()) return toast.error("Ponle un nombre a la plantilla.");
    const row = { program_id: programId, name: name.trim(), fields: keys };
    const q = templateId === "new"
      ? supabase.from("insurer_report_templates" as any).insert(row).select("id").single()
      : supabase.from("insurer_report_templates" as any).update(row).eq("id", templateId).select("id").single();
    const { data, error } = await q;
    if (error) return toast.error(error.code === "42501" ? "Solo administradores o gerentes pueden guardar plantillas." : error.message);
    toast.success("Plantilla guardada.");
    setTemplateId((data as any).id);
    qc.invalidateQueries({ queryKey: ["insurer-templates", programId] });
  }
  async function remove() {
    if (templateId === "new" || !window.confirm("¿Eliminar esta plantilla?")) return;
    const { error } = await supabase.from("insurer_report_templates" as any).delete().eq("id", templateId);
    if (error) return toast.error(error.message);
    pickTemplate("new");
    qc.invalidateQueries({ queryKey: ["insurer-templates", programId] });
  }
  async function run() {
    if (!program) return;
    if (keys.length === 0) return toast.error("Marca al menos un campo.");
    setBusy(true);
    try {
      const ordered = FIELDS.map((f) => f.key).filter((k) => keys.includes(k));
      const n = await exportFields(program, ordered, `reporte-aseguradora-${program.code}-${slugDate()}.xlsx`, "Asegurados");
      toast.success(`Reporte generado con ${n} clientes.`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-semibold">Reporte para aseguradora</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Programa / aseguradora</label>
          <Select value={programId} onValueChange={(v) => { setProgramId(v); pickTemplate("new"); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Programa" /></SelectTrigger>
            <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Plantilla</label>
          <Select value={templateId} onValueChange={pickTemplate}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Nueva plantilla</SelectItem>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre de la plantilla</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Altas HIR" className="w-[220px]" />
        </div>
        <Button variant="outline" onClick={save}><Save className="h-4 w-4 mr-2" />Guardar plantilla</Button>
        {templateId !== "new" && <Button variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 border rounded-md p-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm">
            <Checkbox checked={keys.includes(f.key)} onCheckedChange={(v) => setKeys((k) => (v ? [...k, f.key] : k.filter((x) => x !== f.key)))} />
            {f.label}
          </label>
        ))}
      </div>
      <Button onClick={run} disabled={busy || !program}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Descargar Excel
      </Button>
    </Card>
  );
}
