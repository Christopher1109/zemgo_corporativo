import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, FileDown, Loader2, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { changePolicyStatus } from "@/lib/policies.functions";
import { generateCertificateClient } from "@/lib/pdf/generateCertificate.browser";
import { listPolicyRevisions } from "@/lib/policies-edit.functions";
import { PolicyPaymentsTab } from "@/components/payments/policy-payments-tab";
import { EditPolicyDialog } from "@/components/policies/EditPolicyDialog";
import { RenewPolicyDialog } from "@/components/policies/RenewPolicyDialog";

export const Route = createFileRoute("/_authenticated/policies/$policyId")({
  head: () => ({ meta: [{ title: "Detalle de certificado — Zemgo" }] }),
  component: PolicyDetail,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["active", "cancelled"],
  active: ["expired", "cancelled", "suspended"],
  suspended: ["active", "cancelled"],
};

function PolicyDetail() {
  const { policyId } = Route.useParams();
  const qc = useQueryClient();
  const changeFn = useServerFn(changePolicyStatus);
  const revisionsFn = useServerFn(listPolicyRevisions);

  const [statusDialog, setStatusDialog] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>("");
  const [reason, setReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  const { data: policy, isLoading } = useQuery({
    queryKey: ["policy", policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policies")
        .select(
          "*, programs(id,name,code,color_primary), clients(id,first_name,last_name,curp,phone,email), beneficiaries(*), dependents(*)",
        )
        .eq("id", policyId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["policy-payments", policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("policy_id", policyId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["policy-incidents", policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .eq("policy_id", policyId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["policy-documents", policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("owner_type", "policy")
        .eq("owner_id", policyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["policy-audit", policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("entity_type", "policy")
        .eq("entity_id", policyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ["policy-revisions", policyId],
    queryFn: () => revisionsFn({ data: { policy_id: policyId } }),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      changeFn({ data: { policy_id: policyId, next_status: nextStatus as any, reason: reason || null } }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      setStatusDialog(false);
      setNextStatus("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["policy", policyId] });
      qc.invalidateQueries({ queryKey: ["policy-audit", policyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const pdfMutation = useMutation({
    mutationFn: () => generateCertificateClient(policyId),
    onSuccess: (res) => {
      toast.success("Certificado generado");
      window.open(res.url, "_blank");
      qc.invalidateQueries({ queryKey: ["policy", policyId] });
      qc.invalidateQueries({ queryKey: ["policy-audit", policyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al generar PDF"),
  });

  if (isLoading || !policy) {
    return <div className="text-muted-foreground">Cargando certificado…</div>;
  }

  const allowed = NEXT_STATUS[policy.status] ?? [];

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/policies"><ArrowLeft className="h-4 w-4 mr-1" /> Certificados</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-3">
              <span className="font-mono">{policy.folio}</span>
              <Badge>{STATUS_LABELS[policy.status] ?? policy.status}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {policy.clients?.first_name} {policy.clients?.last_name} · {policy.programs?.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!["expired","cancelled"].includes(policy.status) && (
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4 mr-2" /> Editar</Button>
          )}
          {["active","expired"].includes(policy.status) && policy.end_date && (() => {
            const days = Math.floor((Date.parse(policy.end_date) - Date.now()) / 86400000);
            return (days <= 60 && days >= -30) ? (
              <Button variant="outline" onClick={() => setRenewOpen(true)}><RefreshCw className="h-4 w-4 mr-2" /> Renovar</Button>
            ) : null;
          })()}
          {allowed.length > 0 && (
            <Button variant="outline" onClick={() => setStatusDialog(true)}>Cambiar estado</Button>
          )}
          <Button onClick={() => pdfMutation.mutate()} disabled={pdfMutation.isPending}>
            {pdfMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Generar certificado
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="benef">Beneficiarios</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
          <TabsTrigger value="incidents">Siniestros ({incidents.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="p-5 grid md:grid-cols-2 gap-4 text-sm">
            <Field label="Folio" value={policy.folio} />
            <Field label="Programa" value={policy.programs?.name} />
            <Field label="No. Certificado HIR" value={policy.policy_number ?? "—"} />
            <Field label="No. Certificado" value={policy.certificate_number ?? "—"} />
            <Field label="Titular" value={`${policy.clients?.first_name} ${policy.clients?.last_name}`} />
            <Field label="CURP" value={policy.clients?.curp} />
            <Field label="Contratante" value={policy.contracting_party ?? "—"} />
            <Field label="Emisión" value={policy.issue_date ?? "—"} />
            <Field label="Vigencia" value={`${policy.start_date ?? "—"} → ${policy.end_date ?? "—"}`} />
            <Field label="Prima" value={policy.premium ? `$${Number(policy.premium).toLocaleString("es-MX")}` : "—"} />
            <Field label="Suma asegurada" value={policy.sum_insured ? `$${Number(policy.sum_insured).toLocaleString("es-MX")}` : "—"} />
            <Field label="PDF certificado" value={policy.certificate_pdf_url ? <a className="text-primary underline" href={policy.certificate_pdf_url} target="_blank" rel="noreferrer">Abrir</a> : "—"} />
          </Card>
        </TabsContent>

        <TabsContent value="benef">
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Beneficiarios</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Parentesco</TableHead><TableHead>%</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(policy.beneficiaries ?? []).map((b: any) => (
                    <TableRow key={b.id}><TableCell>{b.full_name}</TableCell><TableCell>{b.relationship}</TableCell><TableCell>{b.percentage}%</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {policy.programs?.code?.toUpperCase() === "ABC" && (
              <div>
                <h3 className="font-semibold mb-2">Dependientes</h3>
                {(policy.dependents ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin dependientes registrados.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Parentesco</TableHead><TableHead>F. Nac.</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(policy.dependents ?? []).map((d: any) => (
                        <TableRow key={d.id}><TableCell>{d.full_name}</TableCell><TableCell>{d.relationship}</TableCell><TableCell>{d.date_of_birth ?? "—"}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <PolicyPaymentsTab policyId={policyId} policyStatus={policy.status} />
        </TabsContent>

        <TabsContent value="incidents">
          <Card>
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-sm text-muted-foreground">{incidents.length} siniestro(s) asociado(s)</div>
              <Button asChild size="sm">
                <Link to="/incidents/new" search={{ policy: policyId }}>+ Reportar siniestro</Link>
              </Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead>Hospital</TableHead><TableHead>Descripción</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {incidents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin siniestros asociados.</TableCell></TableRow>}
                {incidents.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.accident_date ?? new Date(i.occurred_at).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                    <TableCell>{i.hospital ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{i.description ?? "—"}</TableCell>
                    <TableCell><Button asChild size="sm" variant="ghost"><Link to="/incidents/$incidentId" params={{ incidentId: i.id }}>Abrir</Link></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Archivo</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {documents.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin documentos.</TableCell></TableRow>}
                {documents.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.file_name ?? "—"}</TableCell>
                    <TableCell>{d.kind ?? "—"}</TableCell>
                    <TableCell>{new Date(d.created_at).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell><a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary text-xs underline">Abrir</a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-4">
            <Card className="p-0">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">Revisiones del certificado</h3>
                <p className="text-xs text-muted-foreground">Historial de ediciones (datos editados manualmente).</p>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Editado por</TableHead><TableHead>Cambios</TableHead></TableRow></TableHeader>
                <TableBody>
                  {revisions.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-4 text-xs text-muted-foreground">Sin revisiones registradas.</TableCell></TableRow>}
                  {revisions.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.edited_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell className="text-xs">{r.profiles?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="space-y-1">
                          {Object.entries(r.fields_changed ?? {}).map(([field, val]: any) => (
                            <div key={field} className="font-mono">
                              <span className="text-muted-foreground">{field}:</span>{" "}
                              {val?.from !== undefined ? (
                                <><span className="line-through text-rose-600">{JSON.stringify(val.from)}</span>{" → "}<span className="text-emerald-700">{JSON.stringify(val.to)}</span></>
                              ) : (
                                <span className="text-emerald-700">actualizado</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-0">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">Bitácora de auditoría</h3>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Acción</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader>
                <TableBody>
                  {history.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Sin eventos registrados.</TableCell></TableRow>}
                  {history.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(h.created_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell className="font-mono text-xs">{h.action}</TableCell>
                      <TableCell className="text-xs"><pre className="whitespace-pre-wrap font-mono">{h.diff ? JSON.stringify(h.diff, null, 0) : ""}</pre></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <EditPolicyDialog open={editOpen} onOpenChange={setEditOpen} policy={policy} />
      <RenewPolicyDialog open={renewOpen} onOpenChange={setRenewOpen} policy={policy} />

      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cambiar estado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nuevo estado</label>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {allowed.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(nextStatus === "cancelled") && (
              <div>
                <label className="text-sm font-medium">Motivo (obligatorio)</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancelar</Button>
            <Button
              disabled={!nextStatus || (nextStatus === "cancelled" && !reason) || statusMutation.isPending}
              onClick={() => statusMutation.mutate()}
            >
              {statusMutation.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
