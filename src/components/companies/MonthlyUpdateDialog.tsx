import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  parseRosterFile, reconcile,
  type CurrentInsured, type Reconciliation, type RosterPerson,
} from "@/lib/company-roster";

type Props = { company: { id: string; legal_name: string; program_id: string }; open: boolean; onOpenChange: (v: boolean) => void };

async function loadCurrent(companyId: string): Promise<CurrentInsured[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("policies")
      .select("status, certificate_number, clients(id, first_name, last_name, curp, rfc, metadata)")
      .eq("company_id", companyId)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  // Una entrada por persona; si tiene un certificado vigente, ése manda.
  const byClient = new Map<string, CurrentInsured>();
  for (const p of rows) {
    const c = p.clients;
    if (!c) continue;
    const prev = byClient.get(c.id);
    if (prev && prev.policy_status !== "cancelled") continue;
    byClient.set(c.id, {
      client_id: c.id, first_name: c.first_name, last_name: c.last_name ?? "", curp: c.curp, rfc: c.rfc,
      employee_number: c.metadata?.employee_number ?? null, policy_status: p.status, certificate_number: p.certificate_number,
    });
  }
  return [...byClient.values()];
}

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim();

export function MonthlyUpdateDialog({ company, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [newSel, setNewSel] = useState<Record<number, boolean>>({});
  const [bajaSel, setBajaSel] = useState<Record<string, boolean>>({});
  const [elsewhere, setElsewhere] = useState<Record<string, string>>({});

  function reset() {
    setRec(null); setFileName(null); setWarnings([]); setNewSel({}); setBajaSel({}); setElsewhere({});
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const parsed = await parseRosterFile(file, `${company.legal_name} ${period}`);
      if (parsed.people.length === 0) throw new Error(parsed.warnings[0] ?? "No se encontraron asegurados en el archivo.");
      const current = await loadCurrent(company.id);
      const r = reconcile(parsed, current);

      // ¿Algún "nuevo" ya existe en el sistema fuera de esta empresa (cliente individual u otra empresa)?
      const curps = r.nuevos.map((p) => p.curp).filter(Boolean);
      const other: Record<string, string> = {};
      if (curps.length) {
        const { data } = await supabase.from("clients").select("curp, company_id").in("curp", curps);
        for (const c of data ?? []) {
          if (c.company_id !== company.id) other[c.curp] = c.company_id ? "Ya pertenece a otra empresa" : "Ya existe como cliente individual";
        }
      }
      setElsewhere(other);
      setNewSel(Object.fromEntries(r.nuevos.map((p) => [p.row, !other[p.curp]])));
      // Bajas: las reportadas por la empresa se aplican. Si alguien solo "no viene en la lista" pero sigue
      // activo en HIR (ya tiene certificado), se queda activo salvo que lo marques; si no está en HIR, se da de baja.
      setBajaSel(Object.fromEntries(r.bajas.map((b) => [b.current.client_id, b.explicit || !b.current.certificate_number])));
      setRec(r); setFileName(file.name); setWarnings(parsed.warnings);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!rec) return;
    const nuevos = rec.nuevos.filter((p) => newSel[p.row]);
    const bajas = rec.bajas.filter((b) => bajaSel[b.current.client_id]);
    if (!window.confirm(`Se aplicarán ${nuevos.length} altas y ${bajas.length} bajas para ${company.legal_name} (${period}). ¿Continuar?`)) return;
    setBusy(true);
    const toPayload = (p: RosterPerson) => ({
      first_name: p.first_name, last_name: p.last_name, paterno: p.paterno || null, materno: p.materno || null, curp: p.curp, rfc: p.curp.slice(0, 10),
      date_of_birth: p.date_of_birth, gender: p.gender, street: p.street, colonia: p.colonia, zip: p.zip,
      employee_number: p.employee_number, alerts: p.alerts,
      dependents: p.dependents.map((d) => ({
        full_name: fullName(d), relationship: d.relationship, date_of_birth: d.date_of_birth, curp: d.curp, gender: d.gender,
      })),
    });
    const { data, error } = await supabase.rpc("apply_company_monthly_update" as any, {
      _company_id: company.id,
      _payload: {
        file_name: fileName, period,
        nuevos: nuevos.map(toPayload),
        siguen: rec.siguen.map(({ person, current }) => ({
          client_id: current.client_id, employee_number: person.employee_number, curp: person.curp,
          paterno: person.paterno || null, materno: person.materno || null,
          date_of_birth: person.date_of_birth, gender: person.gender, street: person.street, colonia: person.colonia, zip: person.zip,
        })),
        bajas: bajas.map((b) => ({ client_id: b.current.client_id, reason: b.reason })),
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "Solo administradores o gerentes del programa pueden aplicar la actualización." : error.message);
    const r = data as any;
    toast.success(`Listo: ${r.altas} altas, ${r.bajas} bajas, ${r.siguen} siguen.${r.omitidos ? ` ${r.omitidos} ya tenían certificado.` : ""}`);
    await qc.invalidateQueries();
    reset();
    onOpenChange(false);
  }

  const revisar = rec ? [...rec.nuevos, ...rec.siguen.map((s) => s.person)].filter((p) => p.alerts.length) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Actualización mensual — {company.legal_name}</DialogTitle>
          <DialogDescription>
            Sube el listado que mandó la empresa. Antes de guardar verás quién sigue, quién es nuevo y quién se da de baja.
            Los nuevos quedan con un certificado <b>sin número</b>, listos para enviarse a HIR desde "Altas, bajas y certificados". Las bajas aparecen ahí mismo para enviarlas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Mes del listado</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[170px]" disabled={!!rec} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Archivo de la empresa (.xlsx)</Label>
            <Input type="file" accept=".xlsx" disabled={busy} className="max-w-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>
        {warnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}

        {rec && (
          <Tabs defaultValue="nuevos" className="mt-2">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="nuevos">Nuevos ({rec.nuevos.length})</TabsTrigger>
              <TabsTrigger value="bajas">Bajas ({rec.bajas.length})</TabsTrigger>
              <TabsTrigger value="siguen">Siguen ({rec.siguen.length})</TabsTrigger>
              <TabsTrigger value="revisar">Por revisar ({revisar.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="nuevos" className="space-y-1">
              {rec.nuevos.length === 0 && <p className="text-sm text-muted-foreground py-4">No hay asegurados nuevos.</p>}
              {rec.nuevos.map((p) => (
                <label key={p.row} className="flex items-start gap-3 border-b py-2 text-sm">
                  <Checkbox checked={!!newSel[p.row]} onCheckedChange={(v) => setNewSel((s) => ({ ...s, [p.row]: !!v }))} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {fullName(p)}
                      {p.employee_number != null && <Badge variant="outline" className="text-[10px]">Emp. {p.employee_number}</Badge>}
                      {p.alerts.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                      {p.dependents.length > 0 && <Badge variant="secondary" className="text-[10px]">+{p.dependents.length} dependiente(s)</Badge>}
                      {p.reported_alta
                        ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">Alta reportada</Badge>
                        : <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">No venía en la hoja de altas</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{p.curp} · {p.date_of_birth ?? "sin fecha"}</div>
                    {elsewhere[p.curp] && <div className="text-xs text-amber-700">{elsewhere[p.curp]}: desmarcado por defecto.</div>}
                  </div>
                </label>
              ))}
            </TabsContent>

            <TabsContent value="bajas" className="space-y-1">
              {rec.bajas.length === 0 && <p className="text-sm text-muted-foreground py-4">No hay bajas.</p>}
              {rec.bajas.map((b) => (
                <label key={b.current.client_id} className="flex items-start gap-3 border-b py-2 text-sm">
                  <Checkbox checked={!!bajaSel[b.current.client_id]} onCheckedChange={(v) => setBajaSel((s) => ({ ...s, [b.current.client_id]: !!v }))} />
                  <div className="flex-1">
                    <div className="font-medium">{fullName(b.current)}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.reason}{b.current.certificate_number ? ` · Cert. N° ${b.current.certificate_number}` : ""}
                    </div>
                    {!b.explicit && b.current.certificate_number && (
                      <div className="text-xs text-amber-700">Sigue activo en HIR y no viene en las bajas: se queda activo salvo que lo marques.</div>
                    )}
                  </div>
                  <Badge variant="outline" className={b.explicit ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}>
                    {b.explicit ? "Baja reportada" : "No viene en la lista"}
                  </Badge>
                </label>
              ))}
            </TabsContent>

            <TabsContent value="siguen">
              <p className="text-xs text-muted-foreground mb-2">
                Siguen con su certificado. Solo se completan datos que estén vacíos en el sistema (no se sobrescribe nada).
              </p>
              <div className="max-h-72 overflow-y-auto text-sm divide-y">
                {rec.siguen.map(({ person, current }) => (
                  <div key={current.client_id} className="py-1.5 flex justify-between gap-3">
                    <span>{fullName(current)}</span>
                    <span className="text-xs text-muted-foreground">{current.certificate_number ? `Cert. N° ${current.certificate_number}` : "Sin número de certificado"}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="revisar">
              {revisar.length === 0 && <p className="text-sm text-muted-foreground py-4">Todo cuadra.</p>}
              {revisar.map((p) => (
                <div key={p.row} className="border-b py-2 text-sm">
                  <div className="font-medium">{fullName(p)} <span className="font-mono text-xs text-muted-foreground">{p.curp}</span></div>
                  {p.alerts.map((a, i) => <div key={i} className="text-xs text-amber-700">{a.message}</div>)}
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={!rec || busy}>
            <Upload className="h-4 w-4 mr-2" /> Aplicar actualización
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
