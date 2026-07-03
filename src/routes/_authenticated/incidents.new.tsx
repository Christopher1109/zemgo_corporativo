import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { reportIncident } from "@/lib/incidents.functions";

const searchSchema = z.object({ policy: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/incidents/new")({
  head: () => ({ meta: [{ title: "Reportar siniestro — Zemgo" }] }),
  validateSearch: searchSchema,
  component: NewIncident,
});

function NewIncident() {
  const navigate = useNavigate();
  const { policy: prefillPolicy } = useSearch({ from: "/_authenticated/incidents/new" });
  const { activeProgram } = useProgram();
  const reportFn = useServerFn(reportIncident);

  const [policyId, setPolicyId] = useState<string>(prefillPolicy ?? "");
  const [accidentDate, setAccidentDate] = useState("");
  const [accidentTime, setAccidentTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [hospital, setHospital] = useState("");
  const [autoIssuePass, setAutoIssuePass] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: policies = [] } = useQuery({
    queryKey: ["active-policies", activeProgram?.id],
    queryFn: async () => {
      let q = supabase
        .from("policies")
        .select("id, folio, start_date, end_date, sum_insured, deductible, contracting_party, program_id, programs(code, name, color_primary), clients(first_name, last_name, curp)")
        .eq("status", "active")
        .order("folio");
      if (activeProgram?.id) q = q.eq("program_id", activeProgram.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const selected = policies.find((p: any) => p.id === policyId);

  const { data: hospitalSuggestions = [] } = useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => {
      const { data } = await supabase.from("incidents").select("hospital").not("hospital", "is", null).limit(200);
      return Array.from(new Set((data ?? []).map((d: any) => d.hospital).filter(Boolean))) as string[];
    },
  });

  const { data: recentIncidents = [] } = useQuery({
    queryKey: ["client-recent-incidents", selected?.clients ? policyId : null],
    enabled: !!selected,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("incidents")
        .select("id, policy_id, policies!inner(client_id)")
        .gte("reported_at", since)
        .in("status", ["reported", "pending_review", "pass_issued", "in_treatment"]);
      const clientId = (selected as any)?.clients ? policies.find((p: any) => p.id === policyId) : null;
      void clientId;
      return (data ?? []) as any[];
    },
  });

  // count for same client
  const clientId = selected ? (policies.find((p: any) => p.id === selected.id) as any) : null;
  const sameClientRecent = recentIncidents.filter((i: any) => {
    const pol = policies.find((p: any) => p.id === i.policy_id) as any;
    return pol && clientId && pol.clients?.curp === (selected as any)?.clients?.curp;
  }).length;

  // validations
  useEffect(() => {
    if (selected && accidentDate) {
      if (selected.start_date && accidentDate < selected.start_date) {
        toast.error("La fecha del accidente es anterior al inicio de vigencia");
      }
    }
  }, [accidentDate, selected]);

  async function onSubmit() {
    if (!policyId) return toast.error("Selecciona un certificado");
    if (!accidentDate) return toast.error("Fecha del accidente requerida");
    if (description.trim().length < 20) return toast.error("La descripción debe tener mínimo 20 caracteres");
    setSaving(true);
    try {
      const res = await reportFn({
        data: {
          policy_id: policyId,
          accident_date: accidentDate,
          accident_time: accidentTime || null,
          location: location || null,
          description,
          hospital: hospital || null,
          auto_issue_pass: autoIssuePass && !!hospital,
        },
      });
      if ((res as any).auto_pass?.pass_id) {
        toast.success("Siniestro reportado y pase médico emitido");
      } else if ((res as any).auto_pass_error) {
        toast.success("Siniestro reportado. El pase se emite manualmente desde el detalle.");
      } else {
        toast.success("Siniestro reportado");
      }
      navigate({ to: "/incidents/$incidentId", params: { incidentId: res.incident_id } });
    } catch (e: any) {
      toast.error(e.message ?? "Error al reportar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm"><Link to="/incidents"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
      <h1 className="text-2xl font-bold">Reportar siniestro</h1>

      <Card className="p-6 space-y-4">
        <div>
          <Label>Certificado activo *</Label>
          <Select value={policyId} onValueChange={setPolicyId}>
            <SelectTrigger><SelectValue placeholder="Selecciona un certificado activo…" /></SelectTrigger>
            <SelectContent>
              {policies.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.folio} — {p.clients?.first_name} {p.clients?.last_name} ({p.programs?.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <Card className="bg-muted p-4 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Cliente</div>{(selected as any).clients?.first_name} {(selected as any).clients?.last_name}</div>
            <div><div className="text-xs text-muted-foreground">CURP</div>{(selected as any).clients?.curp ?? "—"}</div>
            <div><div className="text-xs text-muted-foreground">Programa</div>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: (selected as any).programs?.color_primary }} />
                {(selected as any).programs?.name}
              </span>
            </div>
            <div><div className="text-xs text-muted-foreground">Folio</div>{selected.folio}</div>
            <div><div className="text-xs text-muted-foreground">Vigencia</div>{selected.start_date} → {selected.end_date}</div>
            <div><div className="text-xs text-muted-foreground">Suma asegurada</div>{selected.sum_insured ? `$${selected.sum_insured}` : "—"}</div>
            <div><div className="text-xs text-muted-foreground">Deducible</div>{selected.deductible ? `$${selected.deductible}` : "—"}</div>
          </Card>
        )}

        {sameClientRecent > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>Este cliente tiene <b>{sameClientRecent}</b> siniestro(s) abierto(s) en los últimos 30 días. Verifica antes de continuar.</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Fecha del accidente *</Label>
            <Input type="date" value={accidentDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAccidentDate(e.target.value)} />
          </div>
          <div>
            <Label>Hora del accidente</Label>
            <Input type="time" value={accidentTime} onChange={(e) => setAccidentTime(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Lugar</Label>
          <Textarea value={location} onChange={(e) => setLocation(e.target.value.slice(0, 500))} placeholder="Dirección o referencia (max 500 car.)" />
        </div>
        <div>
          <Label>Descripción detallada * (mín. 20 caracteres)</Label>
          <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} />
          <div className="text-xs text-muted-foreground mt-1">{description.length}/2000</div>
        </div>
        <div>
          <Label>Hospital destino</Label>
          <Input list="hospitals" value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder="Nombre del hospital" />
          <datalist id="hospitals">
            {hospitalSuggestions.map((h) => <option key={h} value={h} />)}
          </datalist>
        </div>

        <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
          <input
            type="checkbox"
            checked={autoIssuePass}
            onChange={(e) => setAutoIssuePass(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <div className="text-sm">
            <div className="font-medium">Emitir pase médico automáticamente</div>
            <div className="text-xs text-muted-foreground">
              Si capturas hospital y existe un director admin/manager en el programa, el pase se genera al reportar el siniestro. Si no, puedes emitirlo manualmente desde el detalle.
            </div>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" asChild><Link to="/incidents">Cancelar</Link></Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Reportando…" : "Reportar siniestro"}</Button>
        </div>
      </Card>
    </div>
  );
}
