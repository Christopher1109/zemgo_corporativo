import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog";
import { generateBankReference, cancelPayment, refundPayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/payments/$paymentId")({
  head: () => ({ meta: [{ title: "Pago — HOPE Consulting" }] }),
  component: PaymentDetail,
});

function PaymentDetail() {
  const { paymentId } = Route.useParams();
  const qc = useQueryClient();
  const refFn = useServerFn(generateBankReference);
  const cancelFn = useServerFn(cancelPayment);
  const refundFn = useServerFn(refundPayment);
  const [markOpen, setMarkOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data: payment } = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, policies(id, folio, status, program_id, clients(id, first_name, last_name, curp, email, phone), programs(name, code, color_primary))")
        .eq("id", paymentId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["payment-history", paymentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .eq("entity_type", "payments")
        .eq("entity_id", paymentId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const genRef = useMutation({
    mutationFn: () => refFn({ data: { payment_id: paymentId } }),
    onSuccess: (res) => {
      toast.success(res.reused ? "Referencia existente" : "Referencia generada");
      qc.invalidateQueries({ queryKey: ["payment", paymentId] });
      qc.invalidateQueries({ queryKey: ["payment-history", paymentId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { payment_id: paymentId, reason } }),
    onSuccess: () => { toast.success("Pago cancelado"); setCancelOpen(false); setReason(""); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const refundMut = useMutation({
    mutationFn: () => refundFn({ data: { payment_id: paymentId, reason } }),
    onSuccess: () => { toast.success("Pago reembolsado"); setRefundOpen(false); setReason(""); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!payment) return <div className="text-muted-foreground">Cargando…</div>;
  const pol = payment.policies;
  const c = pol?.clients;
  const prog = pol?.programs;

  const copyRef = async () => {
    await navigator.clipboard.writeText(payment.bank_reference);
    toast.success("Referencia copiada");
  };

  const canMark = payment.status === "pending" || payment.status === "overdue";
  const canGenRef = canMark && !payment.bank_reference;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link to="/payments"><ArrowLeft className="h-4 w-4 mr-1" />Cobranza</Link></Button>
        <PaymentStatusBadge status={payment.status} />
      </div>

      <Card className="p-5 grid md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Cliente</div>
          <Link to="/clients" className="font-medium text-primary underline">{c?.first_name} {c?.last_name}</Link>
          <div className="text-xs text-muted-foreground">{c?.curp}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Certificado</div>
          <Link to="/policies/$policyId" params={{ policyId: pol.id }} className="font-mono font-medium text-primary underline">{pol.folio}</Link>
          <div className="text-xs text-muted-foreground">{prog?.name}</div>
        </div>
        <div><div className="text-xs text-muted-foreground">Monto</div><div className="font-semibold">${Number(payment.amount).toLocaleString("es-MX")}</div></div>
        <div><div className="text-xs text-muted-foreground">Vencimiento</div><div>{payment.due_date ?? "—"}</div></div>
        {payment.paid_at && <>
          <div><div className="text-xs text-muted-foreground">Pagado el</div><div>{new Date(payment.paid_at).toLocaleString("es-MX")}</div></div>
          <div><div className="text-xs text-muted-foreground">Monto cobrado</div><div>${Number(payment.paid_amount ?? payment.amount).toLocaleString("es-MX")}</div></div>
          <div><div className="text-xs text-muted-foreground">Método</div><div>{payment.method ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Proveedor</div><div>{payment.provider ?? "—"}</div></div>
        </>}
        {payment.failure_reason && (
          <div className="md:col-span-2 text-red-700"><div className="text-xs">Motivo de falla</div>{payment.failure_reason}</div>
        )}
        {payment.notes && (
          <div className="md:col-span-2"><div className="text-xs text-muted-foreground">Notas</div><pre className="whitespace-pre-wrap text-sm">{payment.notes}</pre></div>
        )}
      </Card>

      {payment.bank_reference && (
        <Card className="p-4 flex items-center justify-between bg-muted/30">
          <div>
            <div className="text-xs text-muted-foreground">Referencia bancaria</div>
            <div className="font-mono text-lg">{payment.bank_reference}</div>
            {payment.bank_reference_expires_at && (
              <div className="text-xs text-muted-foreground">
                Vence: {new Date(payment.bank_reference_expires_at).toLocaleDateString("es-MX")}
              </div>
            )}
          </div>
          <Button onClick={copyRef} variant="outline"><Copy className="h-4 w-4 mr-2" />Copiar</Button>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {canMark && <Button onClick={() => setMarkOpen(true)}>Marcar como pagado</Button>}
        {canGenRef && <Button variant="outline" onClick={() => genRef.mutate()} disabled={genRef.isPending}>Generar referencia bancaria</Button>}
        {canMark && <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancelar pago</Button>}
        {payment.status === "paid" && <>
          <Button variant="outline" disabled><FileDown className="h-4 w-4 mr-2" />Generar recibo PDF (próximamente)</Button>
          <Button variant="outline" onClick={() => setRefundOpen(true)}>Reembolsar</Button>
        </>}
      </div>

      <Card>
        <div className="p-4 border-b font-medium">Historial</div>
        <Table>
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Acción</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader>
          <TableBody>
            {history.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Sin eventos.</TableCell></TableRow>}
            {history.map((h: any) => (
              <TableRow key={h.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(h.created_at).toLocaleString("es-MX")}</TableCell>
                <TableCell className="font-mono text-xs">{h.action}</TableCell>
                <TableCell className="text-xs"><pre className="whitespace-pre-wrap font-mono">{h.diff ? JSON.stringify(h.diff) : ""}</pre></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <MarkPaidDialog open={markOpen} onOpenChange={setMarkOpen} payment={payment} />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar pago</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo (mínimo 3 caracteres)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Cerrar</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3 || cancelMut.isPending} onClick={() => cancelMut.mutate()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reembolsar pago</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo del reembolso" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Cerrar</Button>
            <Button disabled={reason.trim().length < 3 || refundMut.isPending} onClick={() => refundMut.mutate()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
