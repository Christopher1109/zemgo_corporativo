import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const fmtMx = (n: number) => `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
const monthLabel = (period: string) =>
  new Date(`${period}T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pagado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  overdue: { label: "Vencido", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

const METHODS = [
  { value: "bank_transfer", label: "Transferencia" },
  { value: "bank_reference", label: "Referencia bancaria" },
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "manual", label: "Otro / manual" },
];

/** Cobro consolidado de la empresa: un solo cobro mensual (asegurados vigentes × precio por persona). */
export function CompanyChargesCard({ charges, companyId }: { charges: any[]; companyId: string }) {
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ method: "bank_transfer", paid_at: new Date().toISOString().slice(0, 10), reference: "", amount: "", notes: "" });

  function openPay(c: any) {
    setForm({ method: "bank_transfer", paid_at: new Date().toISOString().slice(0, 10), reference: "", amount: String(c.amount), notes: "" });
    setPayOpen(c);
  }

  async function save() {
    if (!payOpen) return;
    if (["bank_transfer", "bank_reference"].includes(form.method) && !form.reference.trim())
      return toast.error("Captura la referencia o folio de la transferencia.");
    setBusy(true);
    const { error } = await supabase.rpc("mark_company_charge_paid" as any, {
      _charge_id: payOpen.id,
      _method: form.method,
      _paid_at: new Date(`${form.paid_at}T12:00:00`).toISOString(),
      _reference: form.reference.trim() || null,
      _paid_amount: form.amount ? Number(form.amount) : null,
      _notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "No tienes permiso para registrar pagos en este programa." : error.message);
    toast.success(`Pago de ${monthLabel(payOpen.period)} registrado.`);
    setPayOpen(null);
    await qc.invalidateQueries({ queryKey: ["company", companyId] });
    await qc.invalidateQueries({ queryKey: ["alerts-overview"] });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Cobros de la empresa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          La empresa paga un solo cobro al mes por todos sus asegurados vigentes. Los asegurados no reciben cobros ni recordatorios individuales.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {charges.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Aún no hay cobros generados. Se generan automáticamente 10 días antes del día 10 de cada mes.</div>
        ) : (
          <div className="divide-y">
            {charges.map((c) => {
              const st = STATUS[c.status] ?? { label: c.status, cls: "" };
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium capitalize">{monthLabel(c.period)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.insured_count} asegurados{c.unit_price ? ` × ${fmtMx(c.unit_price)}` : ""} · vence {c.due_date}
                      {c.paid_at ? ` · pagado ${new Date(c.paid_at).toLocaleDateString("es-MX")}` : ""}
                      {c.reference ? ` · ref. ${c.reference}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  <div className="w-24 text-right font-semibold tabular-nums">{fmtMx(c.paid_amount ?? c.amount)}</div>
                  {(c.status === "pending" || c.status === "overdue") ? (
                    <Button size="sm" variant="outline" onClick={() => openPay(c)}>Registrar pago</Button>
                  ) : <div className="w-[118px]" />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!payOpen} onOpenChange={(v) => !v && setPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago — {payOpen ? monthLabel(payOpen.period) : ""}</DialogTitle>
            <DialogDescription>Cobro consolidado de la empresa por {payOpen?.insured_count} asegurados.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de pago</Label>
              <Input type="date" value={form.paid_at} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Monto pagado</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Referencia</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
