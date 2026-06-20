import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Sparkles, Loader2 } from "lucide-react";
import { updatePolicy } from "@/lib/policies-edit.functions";
import { toast } from "sonner";

type Beneficiary = { full_name: string; relationship: string; percentage: number; display_order?: number };
type Dependent = { full_name: string; relationship: string; date_of_birth?: string };

const STATE_EDITABILITY: Record<string, { scalar: boolean; financial: boolean; benef: boolean }> = {
  draft:           { scalar: true,  financial: true,  benef: true },
  pending_payment: { scalar: true,  financial: true,  benef: true },
  suspended:       { scalar: true,  financial: true,  benef: true },
  active:          { scalar: false, financial: false, benef: true },
  expired:         { scalar: false, financial: false, benef: false },
  cancelled:       { scalar: false, financial: false, benef: false },
};

export function EditPolicyDialog({
  open, onOpenChange, policy,
}: { open: boolean; onOpenChange: (o: boolean) => void; policy: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(updatePolicy);
  const editability = STATE_EDITABILITY[policy?.status] ?? { scalar: false, financial: false, benef: false };

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [premium, setPremium] = useState("");
  const [contracting, setContracting] = useState("");
  const [benef, setBenef] = useState<Beneficiary[]>([]);
  const [deps, setDeps] = useState<Dependent[]>([]);

  useEffect(() => {
    if (open && policy) {
      setStartDate(policy.start_date ?? "");
      setEndDate(policy.end_date ?? "");
      setPremium(String(policy.premium ?? ""));
      setContracting(policy.contracting_party ?? "");
      setBenef((policy.beneficiaries ?? []).map((b: any) => ({
        full_name: b.full_name, relationship: b.relationship ?? "", percentage: Number(b.percentage ?? 0),
        display_order: b.display_order ?? 0,
      })));
      setDeps((policy.dependents ?? []).map((d: any) => ({
        full_name: d.full_name, relationship: d.relationship ?? "", date_of_birth: d.date_of_birth ?? "",
      })));
    }
  }, [open, policy]);

  const sumPct = useMemo(() => benef.reduce((s, b) => s + Number(b.percentage || 0), 0), [benef]);
  const distributeEvenly = () => {
    if (benef.length === 0) return;
    const each = Math.floor((100 / benef.length) * 100) / 100;
    const rest = Number((100 - each * (benef.length - 1)).toFixed(2));
    setBenef(benef.map((b, i) => ({ ...b, percentage: i === benef.length - 1 ? rest : each })));
  };

  const mut = useMutation({
    mutationFn: () => {
      const changes: any = {};
      if (editability.scalar) {
        if (startDate !== (policy.start_date ?? "")) changes.start_date = startDate || null;
        if (endDate !== (policy.end_date ?? "")) changes.end_date = endDate || null;
        if (contracting !== (policy.contracting_party ?? "")) changes.contracting_party = contracting || null;
      }
      if (editability.financial && premium !== String(policy.premium ?? "")) {
        changes.premium = Number(premium);
      }
      if (editability.benef) {
        changes.beneficiaries = benef.map((b, i) => ({ ...b, display_order: i }));
        if (Array.isArray(policy.dependents)) changes.dependents = deps;
      }
      return fn({ data: { policy_id: policy.id, changes } });
    },
    onSuccess: (res: any) => {
      if (res?.no_changes) toast.info("Sin cambios para guardar");
      else toast.success("Certificado actualizado");
      qc.invalidateQueries({ queryKey: ["policy", policy.id] });
      qc.invalidateQueries({ queryKey: ["policy-audit", policy.id] });
      qc.invalidateQueries({ queryKey: ["policy-revisions", policy.id] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Error";
      const friendly: Record<string, string> = {
        cannot_lower_premium_with_paid: "No puedes bajar la prima: ya hay pagos registrados.",
        beneficiaries_must_sum_100: "Los beneficiarios deben sumar 100%.",
        policy_locked: "Este certificado no se puede editar en su estado actual.",
        forbidden: "No tienes permisos para editar este certificado.",
      };
      toast.error(friendly[msg] ?? msg);
    },
  });

  if (!policy) return null;

  const benefValid = benef.length === 0 || sumPct === 100;
  const showBenefWarn = editability.benef && benef.length > 0 && sumPct !== 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar certificado {policy.folio}</DialogTitle>
          <DialogDescription>
            Estado: <Badge variant="outline">{policy.status}</Badge>
            {policy.status === "active" && " · Solo beneficiarios y dependientes son editables."}
            {(policy.status === "expired" || policy.status === "cancelled") && " · Solo lectura."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset disabled={!editability.scalar} className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vigencia inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vigencia fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Contratante</Label>
              <Input value={contracting} onChange={(e) => setContracting(e.target.value)} />
            </div>
          </fieldset>

          <fieldset disabled={!editability.financial}>
            <div className="space-y-1.5">
              <Label>Prima</Label>
              <Input type="number" step="0.01" value={premium} onChange={(e) => setPremium(e.target.value)} />
              <p className="text-xs text-muted-foreground">No se permite bajar la prima si ya hay pagos registrados.</p>
            </div>
          </fieldset>

          <fieldset disabled={!editability.benef} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Beneficiarios</Label>
              <div className="flex items-center gap-2">
                <Badge variant={sumPct === 100 ? "default" : "destructive"}>{sumPct}%</Badge>
                {showBenefWarn && (
                  <Button type="button" size="sm" variant="outline" onClick={distributeEvenly}>
                    <Sparkles className="h-3 w-3 mr-1" /> Distribuir equitativo
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setBenef([...benef, { full_name: "", relationship: "", percentage: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead><TableHead>Parentesco</TableHead>
                <TableHead className="w-24">%</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {benef.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={b.full_name} onChange={(e) => {
                      const v = [...benef]; v[i].full_name = e.target.value; setBenef(v);
                    }} /></TableCell>
                    <TableCell><Input value={b.relationship} onChange={(e) => {
                      const v = [...benef]; v[i].relationship = e.target.value; setBenef(v);
                    }} /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={b.percentage}
                      onChange={(e) => { const v = [...benef]; v[i].percentage = Number(e.target.value); setBenef(v); }} /></TableCell>
                    <TableCell><Button type="button" size="icon" variant="ghost"
                      onClick={() => setBenef(benef.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button></TableCell>
                  </TableRow>
                ))}
                {benef.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">Sin beneficiarios</TableCell></TableRow>}
              </TableBody>
            </Table>
          </fieldset>

          {policy.programs?.code?.toUpperCase() === "ABC" && editability.benef && (
            <fieldset className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Dependientes</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setDeps([...deps, { full_name: "", relationship: "", date_of_birth: "" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nombre</TableHead><TableHead>Parentesco</TableHead>
                  <TableHead>F. Nac.</TableHead><TableHead className="w-10"></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deps.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell><Input value={d.full_name} onChange={(e) => {
                        const v = [...deps]; v[i].full_name = e.target.value; setDeps(v);
                      }} /></TableCell>
                      <TableCell><Input value={d.relationship} onChange={(e) => {
                        const v = [...deps]; v[i].relationship = e.target.value; setDeps(v);
                      }} /></TableCell>
                      <TableCell><Input type="date" value={d.date_of_birth ?? ""} onChange={(e) => {
                        const v = [...deps]; v[i].date_of_birth = e.target.value; setDeps(v);
                      }} /></TableCell>
                      <TableCell><Button type="button" size="icon" variant="ghost"
                        onClick={() => setDeps(deps.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button></TableCell>
                    </TableRow>
                  ))}
                  {deps.length === 0 && <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">Sin dependientes</TableCell></TableRow>}
                </TableBody>
              </Table>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!benefValid || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
