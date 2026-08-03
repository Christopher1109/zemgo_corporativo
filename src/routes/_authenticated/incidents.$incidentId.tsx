import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, X, FileDown, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { issueMedicalPass, rejectIncident, revokeMedicalPass, getMedicalPassSignedUrl } from "@/lib/incidents.functions";
import { INCIDENT_STATUS } from "./incidents.index";

export const Route = createFileRoute("/_authenticated/incidents/$incidentId")({
  head: () => ({ meta: [{ title: "Detalle de siniestro — ZEMGO" }] }),
  component: IncidentDetail,
});

function IncidentDetail() {
  const { incidentId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const issueFn = useServerFn(issueMedicalPass);
  const rejectFn = useServerFn(rejectIncident);
  const revokeFn = useServerFn(revokeMedicalPass);
  const signFn = useServerFn(getMedicalPassSignedUrl);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [revokePassId, setRevokePassId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hospitalOverride, setHospitalOverride] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, policies!inner(*, programs(*)), clients!inner(*)")
        .eq("id", incidentId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const programId = incident?.policies?.program_id;

  const { data: passes = [] } = useQuery({
    queryKey: ["incident-passes", incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_passes")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["incident-history", incidentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, diff, created_at, user_id")
        .or(`entity_id.eq.${incidentId},and(entity_type.eq.medical_pass,entity_id.in.(${passes.map((p) => p.id).join(",") || "00000000-0000-0000-0000-000000000000"}))`)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!incidentId,
  });

  const { data: myAccess } = useQuery({
    queryKey: ["my-access", programId, user?.id],
    enabled: !!programId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_program_access")
        .select("role")
        .eq("user_id", user!.id)
        .eq("program_id", programId)
        .maybeSingle();
      return data?.role as string | undefined;
    },
  });

  const { data: directors = [] } = useQuery({
    queryKey: ["directors", programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data: access } = await supabase
        .from("user_program_access")
        .select("user_id, role")
        .eq("program_id", programId)
        .in("role", ["admin", "manager"]);
      const ids = (access ?? []).map((a: any) => a.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, signature_url")
        .in("id", ids);
      // Show every admin/manager — director firma con su nombre aunque no haya imagen de firma.
      return (profs ?? []) as any[];
    },
  });

  if (isLoading || !incident) {
    return <div className="p-6 text-center text-muted-foreground">Cargando…</div>;
  }

  const st = INCIDENT_STATUS[incident.status] ?? { label: incident.status, cls: "" };
  const canDecide = ["admin", "manager", "claims"].includes(myAccess ?? "");
  const canRevoke = ["admin", "manager"].includes(myAccess ?? "");
  const hasActivePass = passes.some(
    (p: any) => !p.revoked_at && new Date(p.valid_until).getTime() > Date.now(),
  );
  const canApprove = canDecide && ["reported", "pending_review"].includes(incident.status) && !hasActivePass;

  async function handleApprove() {
    if (!directorId) return toast.error("Selecciona un director");
    if (!confirmed) return toast.error("Confirma la revisión");
    setBusy(true);
    try {
      await issueFn({
        data: {
          incident_id: incidentId,
          director_id: directorId,
          hospital: hospitalOverride || incident.hospital || "",
        },
      });
      toast.success("Pase médico emitido");
      setApproveOpen(false);
      setConfirmed(false);
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident-passes", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident-history", incidentId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function handleReject() {
    if (reason.trim().length < 30) return toast.error("Motivo debe tener mínimo 30 caracteres");
    setBusy(true);
    try {
      await rejectFn({ data: { incident_id: incidentId, reason } });
      toast.success("Siniestro rechazado");
      setRejectOpen(false); setReason("");
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident-history", incidentId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function handleRevoke() {
    if (!revokePassId) return;
    if (reason.trim().length < 10) return toast.error("Motivo requerido (mín. 10 car.)");
    setBusy(true);
    try {
      await revokeFn({ data: { pass_id: revokePassId, reason } });
      toast.success("Pase anulado");
      setRevokePassId(null); setReason("");
      qc.invalidateQueries({ queryKey: ["incident-passes", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident-history", incidentId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function downloadPass(passId: string) {
    try {
      const { url } = await signFn({ data: { pass_id: passId } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm"><Link to="/incidents"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Siniestro {incident.id.slice(0, 8)}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={st.cls}>{st.label}</Badge>
            <span className="text-sm text-muted-foreground">
              Reportado {new Date(incident.reported_at).toLocaleString("es-MX")}
            </span>
          </div>
        </div>
        {/* Los siniestros ahora se autorizan automáticamente al ser reportados.
            El despacho tiene visibilidad de solo-lectura. */}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Siniestro</TabsTrigger>
          <TabsTrigger value="insured">Asegurado y certificado</TabsTrigger>
          <TabsTrigger value="passes">Pases médicos ({passes.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="p-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Fecha del accidente" value={incident.accident_date ?? "—"} />
            <Field label="Hora" value={incident.accident_time ?? "—"} />
            <Field label="Hospital" value={incident.hospital ?? "—"} />
            <Field label="Lugar" value={incident.location_description ?? "—"} />
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground">Descripción</div>
              <div className="whitespace-pre-wrap">{incident.description ?? "—"}</div>
            </div>
            {incident.rejection_reason && (
              <div className="col-span-2 bg-red-50 border border-red-200 rounded p-3">
                <div className="text-xs font-semibold text-red-700">Motivo de rechazo</div>
                <div className="text-sm">{incident.rejection_reason}</div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="insured">
          <Card className="p-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Asegurado" value={`${incident.clients.first_name} ${incident.clients.last_name ?? ""}`} />
            <Field label="CURP" value={incident.clients.curp ?? "—"} />
            <Field label="Fecha nacimiento" value={incident.clients.date_of_birth ?? "—"} />
            <Field label="Contratante" value={incident.policies.contracting_party ?? "—"} />
            <Field label="Folio certificado" value={incident.policies.folio} />
            <Field label="No. de póliza" value={incident.policies.policy_number ?? "—"} />
            <Field label="No. Certificado" value={incident.policies.certificate_number ?? "—"} />
            <Field label="Vigencia" value={`${incident.policies.start_date ?? "—"} → ${incident.policies.end_date ?? "—"}`} />
            <Field label="Suma asegurada" value={incident.policies.sum_insured ? `$${incident.policies.sum_insured}` : "—"} />
            <Field label="Deducible" value={incident.policies.deductible ? `$${incident.policies.deductible}` : "—"} />
          </Card>
        </TabsContent>

        <TabsContent value="passes">
          <Card className="p-4 space-y-3">
            {passes.length === 0 && <div className="text-sm text-muted-foreground">Sin pases médicos emitidos.</div>}
            {passes.map((p: any) => {
              const expired = new Date(p.valid_until).getTime() < Date.now();
              const revoked = !!p.revoked_at;
              const snap = (p.snapshot ?? {}) as any;
              return (
                <div key={p.id} className="border rounded p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">Carta de autorización {p.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        Emitido {new Date(p.valid_from).toLocaleString("es-MX")} · Vence {new Date(p.valid_until).toLocaleString("es-MX")}
                      </div>
                      <div className="text-xs">Director: {p.director_name ?? "—"}</div>
                      {revoked && <div className="text-xs text-red-600">ANULADO: {p.revocation_reason}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={revoked ? "bg-red-100 text-red-800" : expired ? "bg-gray-100" : "bg-green-100 text-green-800"}>
                        {revoked ? "Anulado" : expired ? "Expirado" : "Activo"}
                      </Badge>
                      {!revoked && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => downloadPass(p.id)}>
                          <FileDown className="h-4 w-4 mr-1" /> {p.pdf_url ? "Descargar PDF" : "Generar y descargar PDF"}
                        </Button>
                      )}
                      {canRevoke && !revoked && !expired && (
                        <Button size="sm" variant="destructive" onClick={() => { setRevokePassId(p.id); setReason(""); }}>
                          <Ban className="h-4 w-4 mr-1" /> Anular
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                    <Field label="Asegurado" value={snap.insured_name ?? "—"} />
                    <Field label="CURP" value={snap.insured_curp ?? "—"} />
                    <Field label="Programa" value={`${snap.program_code ?? "—"} ${snap.program_name ?? ""}`} />
                    <Field label="Folio certificado" value={snap.folio ?? "—"} />
                    <Field label="No. de póliza" value={snap.policy_number ?? "—"} />
                    <Field label="No. Certificado" value={snap.certificate_number ?? "—"} />
                    <Field label="Contratante" value={snap.contracting_party ?? "—"} />
                    <Field label="Hospital" value={snap.hospital ?? "—"} />
                    <Field label="Suma asegurada" value={snap.sum_insured ? `$${snap.sum_insured}` : "—"} />
                    <Field label="Deducible" value={snap.deductible ? `$${snap.deductible}` : "—"} />
                    <Field label="Fecha accidente" value={`${snap.accident_date ?? "—"} ${snap.accident_time ?? ""}`} />
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>


        <TabsContent value="history">
          <Card className="p-4 space-y-2">
            {history.length === 0 && <div className="text-sm text-muted-foreground">Sin eventos registrados.</div>}
            {history.map((h: any) => (
              <div key={h.id} className="border-l-2 border-primary pl-3 py-1">
                <div className="text-sm font-medium">{h.action}</div>
                <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("es-MX")}</div>
                {h.diff && <pre className="text-[10px] bg-muted p-1 rounded mt-1 overflow-x-auto">{JSON.stringify(h.diff, null, 2)}</pre>}
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprobar y emitir pase médico</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-muted p-3 rounded">
              <div><b>Asegurado:</b> {incident.clients.first_name} {incident.clients.last_name}</div>
              <div><b>Certificado:</b> {incident.policies.folio}</div>
              <div><b>Accidente:</b> {incident.accident_date} {incident.accident_time}</div>
            </div>
            <div>
              <Label>Hospital destino</Label>
              <Input value={hospitalOverride || incident.hospital || ""} onChange={(e) => setHospitalOverride(e.target.value)} />
            </div>
            <div>
              <Label>Director que firma *</Label>
              <Select value={directorId} onValueChange={setDirectorId}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {directors.length === 0 && <div className="p-2 text-xs text-muted-foreground">No hay directores asignados a este programa.</div>}
                  {directors.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2">
              <Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} />
              <span className="text-xs">Confirmo que revisé el caso y autorizo la emisión del pase médico.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={busy || !confirmed || !directorId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar y emitir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar siniestro</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-muted-foreground">¿Estás seguro? Esta acción queda registrada y notifica al cliente.</div>
            <div>
              <Label>Motivo del rechazo * (mín. 30 caracteres)</Label>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="text-xs text-muted-foreground mt-1">{reason.length}/30</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>Confirmar rechazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke dialog */}
      <Dialog open={!!revokePassId} onOpenChange={(o) => !o && setRevokePassId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Anular pase médico</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-red-600 font-medium">Esta acción es irreversible.</div>
            <div>
              <Label>Motivo *</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokePassId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={busy}>Anular pase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div><div className="text-xs text-muted-foreground">{label}</div><div>{value}</div></div>
  );
}
