import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { markPaymentPaid } from "@/lib/payments.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: { id: string; amount: number; status: string; paid_at?: string | null };
  onDone?: () => void;
};

const METHODS = [
  { v: "bank_transfer", label: "Transferencia bancaria" },
  { v: "cash", label: "Efectivo" },
  { v: "bank_reference", label: "Referencia bancaria" },
  { v: "manual", label: "Manual / otro" },
];

export function MarkPaidDialog({ open, onOpenChange, payment, onDone }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [method, setMethod] = useState("bank_transfer");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(payment.amount));
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(markPaymentPaid);

  const refRequired = method === "bank_transfer" || method === "bank_reference";
  const numericAmount = Number(amount);
  const amountChanged = Math.abs(numericAmount - Number(payment.amount)) > 0.0001;
  const reasonRequired = amountChanged;

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          payment_id: payment.id,
          method: method as any,
          paid_at: new Date(paidAt + "T12:00:00").toISOString(),
          reference: refRequired ? reference : null,
          paid_amount: amountChanged ? numericAmount : null,
          notes: notes || null,
          amount_change_reason: amountChanged ? reason : null,
        },
      }),
    onSuccess: () => {
      toast.success("Pago registrado");
      onOpenChange(false);
      qc.invalidateQueries();
      onDone?.();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      if (msg.includes("already_paid")) {
        toast.error(`Este pago ya fue registrado el ${msg.split(":").slice(1).join(":")}`);
      } else if (msg.includes("reference_required")) {
        toast.error("La referencia/folio bancario es obligatorio para este método.");
      } else if (msg.includes("paid_at_cannot_be_future")) {
        toast.error("La fecha de pago no puede ser futura.");
      } else if (msg.includes("forbidden")) {
        toast.error("No tienes permiso para registrar pagos.");
      } else {
        toast.error(msg);
      }
    },
  });

  const blockedAlreadyPaid = payment.status === "paid";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar pago manual</DialogTitle></DialogHeader>
        {blockedAlreadyPaid ? (
          <p className="text-sm text-muted-foreground">
            Este pago ya fue registrado{payment.paid_at ? ` el ${new Date(payment.paid_at).toLocaleDateString("es-MX")}` : ""}.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Método de pago</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input type="date" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div>
              <Label>Referencia / folio bancario {refRequired && <span className="text-destructive">*</span>}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <Label>Monto cobrado</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amountChanged && (
                <p className="text-xs text-amber-700 mt-1">
                  Monto distinto al original (${Number(payment.amount).toLocaleString("es-MX")}).
                </p>
              )}
            </div>
            {reasonRequired && (
              <div>
                <Label>Motivo del ajuste de monto <span className="text-destructive">*</span></Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {!blockedAlreadyPaid && (
            <Button
              disabled={
                mut.isPending ||
                (refRequired && reference.trim().length === 0) ||
                (reasonRequired && reason.trim().length < 3) ||
                isNaN(numericAmount) || numericAmount <= 0
              }
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Guardando…" : "Confirmar pago"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
