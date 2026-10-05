import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CreditCard, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const fmtMx = (n: number) => `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
export const monthLabel = (period: string) =>
  new Date(`${period}T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const todayIso = () => new Date().toLocaleDateString("en-CA");
export const daysUntil = (d: string) =>
  Math.round((new Date(`${d.slice(0, 10)}T12:00:00`).getTime() - new Date(`${todayIso()}T12:00:00`).getTime()) / 86400000);

export const CHARGE_STATUS: Record<string, { label: string; cls: string }> = {
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

/** Próximo cobro mensual: se genera 10 días antes del día 10 de cada mes. */
export function nextChargeInfo(charges: any[]) {
  const now = new Date(`${todayIso()}T12:00:00`);
  const periods = new Set(charges.map((c) => String(c.period).slice(0, 7)));
  for (let i = 0; i < 3; i++) {
    const p = new Date(now.getFullYear(), now.getMonth() + i, 1, 12);
    const key = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
    if (periods.has(key)) continue;
    const due = new Date(p.getFullYear(), p.getMonth(), 10, 12);
    const gen = new Date(due.getTime() - 10 * 86400000);
    return { period: `${key}-01`, due: due.toLocaleDateString("en-CA"), generates: gen.toLocaleDateString("en-CA") };
  }
  return null;
}

/** El cobro "actual": el vencido más antiguo, si no el pendiente más próximo, si no el último pagado. */
export function currentCharge(charges: any[]) {
  const open = charges.filter((c) => c.status === "overdue" || c.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (open.length) return open[0];
  return [...charges].sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
}

/** Diálogo para registrar el pago de un cobro de empresa (lo usan la ficha de la empresa y Alertas). */
export function RegisterCompanyPaymentDialog({ charge, onClose, onDone }: { charge: any | null; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ method: "bank_transfer", paid_at: todayIso(), reference: "", amount: "", notes: "" });
  const [lastId, setLastId] = useState<string | null>(null);
  if (charge && charge.id !== lastId) {
    setLastId(charge.id);
    setForm({ method: "bank_transfer", paid_at: todayIso(), reference: "", amount: String(charge.amount), notes: "" });
  }

  async function save() {
    if (!charge) return;
    if (["bank_transfer", "bank_reference"].includes(form.method) && !form.reference.trim())
      return toast.error("Captura la referencia o folio de la transferencia.");
    setBusy(true);
    const { error } = await supabase.rpc("mark_company_charge_paid" as any, {
      _charge_id: charge.id,
      _method: form.method,
      _paid_at: new Date(`${form.paid_at}T12:00:00`).toISOString(),
      _reference: form.reference.trim() || null,
      _paid_amount: form.amount ? Number(form.amount) : null,
      _notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "No tienes permiso para registrar pagos en este programa." : error.message);
    toast.success(`Pago de ${monthLabel(charge.period)} registrado. El siguiente cobro se genera solo el próximo mes.`);
    await qc.invalidateQueries({ queryKey: ["company", charge.company_id] });
    await qc.invalidateQueries({ queryKey: ["alerts-overview"] });
    onDone?.();
    onClose();
  }

  return (
    <Dialog open={!!charge} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago — {charge ? monthLabel(charge.period) : ""}</DialogTitle>
          <DialogDescription>
            Cobro de la empresa por {charge?.insured_count} asegurados{charge?.unit_price ? ` × ${fmtMx(charge.unit_price)}` : ""} = {fmtMx(charge?.amount)}.
          </DialogDescription>
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
            <Input type="date" value={form.paid_at} max={todayIso()} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevertPaymentDialog({ charge, onClose }: { charge: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!charge) return;
    if (!reason.trim()) return toast.error("Escribe el motivo (por ejemplo: la transferencia no se reflejó).");
    setBusy(true);
    const { error } = await supabase.rpc("revert_company_charge_payment" as any, { _charge_id: charge.id, _reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "No tienes permiso para modificar pagos en este programa." : error.message);
    toast.success(`El cobro de ${monthLabel(charge.period)} volvió a quedar sin pagar.`);
    setReason("");
    await qc.invalidateQueries({ queryKey: ["company", charge.company_id] });
    await qc.invalidateQueries({ queryKey: ["alerts-overview"] });
    onClose();
  }
  return (
    <Dialog open={!!charge} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como NO pagado — {charge ? monthLabel(charge.period) : ""}</DialogTitle>
          <DialogDescription>
            Úsalo si el pago se registró por error o no se reflejó en el banco. El cobro vuelve a pendiente (o vencido si ya pasó la fecha) y aparece otra vez en Alertas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. la transferencia fue rechazada" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Marcar como no pagado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resumen de cobro de la empresa: va arriba en la ficha (estado del mes, vencimiento y siguiente cobro). */
export function CompanyBillingSummary({ charges, activeCount, unitPrice }: { charges: any[]; activeCount: number; unitPrice: number | null }) {
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const cur = currentCharge(charges);
  const next = nextChargeInfo(charges);
  const d = cur ? daysUntil(cur.due_date) : null;
  const open = cur && (cur.status === "pending" || cur.status === "overdue");
  const tone = !cur ? "border-muted" : cur.status === "paid" ? "border-emerald-300 bg-emerald-50/50"
    : cur.status === "overdue" ? "border-rose-300 bg-rose-50/60" : (d ?? 99) <= 5 ? "border-amber-300 bg-amber-50/60" : "border-sky-200 bg-sky-50/40";

  return (
    <Card className={tone}>
      <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {cur?.status === "paid" ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" /> : <CreditCard className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            {cur ? (
              <>
                <div className="font-semibold flex items-center gap-2 flex-wrap">
                  Cobro de {monthLabel(cur.period)}: {fmtMx(cur.paid_amount ?? cur.amount)}
                  <Badge variant="outline" className={CHARGE_STATUS[cur.status]?.cls}>{CHARGE_STATUS[cur.status]?.label ?? cur.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {cur.insured_count} asegurados{cur.unit_price ? ` × ${fmtMx(cur.unit_price)}` : ""} ·{" "}
                  {cur.status === "paid"
                    ? `pagado el ${fmtDay(cur.paid_at)}${cur.reference ? ` (ref. ${cur.reference})` : ""}`
                    : cur.status === "overdue"
                      ? <b className="text-rose-700">venció el {fmtDay(cur.due_date)} (hace {Math.abs(d!)} días)</b>
                      : <b className={d! <= 5 ? "text-amber-700" : ""}>vence el {fmtDay(cur.due_date)} ({d === 0 ? "hoy" : `en ${d} días`})</b>}
                </div>
              </>
            ) : <div className="font-semibold">Aún no hay cobros generados</div>}
            {next && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                Siguiente cobro: {monthLabel(next.period)} · se genera el {fmtDay(next.generates)} y vence el {fmtDay(next.due)} ·
                estimado {fmtMx(activeCount * (unitPrice ?? 0))} ({activeCount} × {fmtMx(unitPrice ?? 0)})
              </div>
            )}
          </div>
        </div>
        {open && <Button onClick={() => setPayOpen(cur)}><CheckCircle2 className="h-4 w-4 mr-2" />Registrar pago</Button>}
      </CardContent>
      <RegisterCompanyPaymentDialog charge={payOpen} onClose={() => setPayOpen(null)} />
    </Card>
  );
}

/** Historial de cobros de la empresa: un cobro mensual por todos los asegurados vigentes. */
export function CompanyChargesCard({ charges }: { charges: any[]; companyId: string }) {
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [revertOpen, setRevertOpen] = useState<any | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Historial de cobros de la empresa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          La empresa paga un solo cobro al mes por todos sus asegurados vigentes (se genera solo, 10 días antes del día 10).
          Los asegurados no reciben cobros ni recordatorios individuales.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {charges.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Aún no hay cobros generados.</div>
        ) : (
          <div className="divide-y">
            {charges.map((c) => {
              const st = CHARGE_STATUS[c.status] ?? { label: c.status, cls: "" };
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium capitalize">{monthLabel(c.period)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.insured_count} asegurados{c.unit_price ? ` × ${fmtMx(c.unit_price)}` : ""} · vence {fmtDay(c.due_date)}
                      {c.paid_at ? ` · pagado ${fmtDay(c.paid_at)}` : ""}
                      {c.reference ? ` · ref. ${c.reference}` : ""}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  <div className="w-24 text-right font-semibold tabular-nums">{fmtMx(c.paid_amount ?? c.amount)}</div>
                  {(c.status === "pending" || c.status === "overdue") ? (
                    <Button size="sm" variant="outline" onClick={() => setPayOpen(c)}>Registrar pago</Button>
                  ) : c.status === "paid" ? (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRevertOpen(c)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />No se pagó
                    </Button>
                  ) : <div className="w-[118px]" />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <RegisterCompanyPaymentDialog charge={payOpen} onClose={() => setPayOpen(null)} />
      <RevertPaymentDialog charge={revertOpen} onClose={() => setRevertOpen(null)} />
    </Card>
  );
}
