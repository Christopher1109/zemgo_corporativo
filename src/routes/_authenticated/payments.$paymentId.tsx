import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { auditActionLabel, describeAuditDiff } from "@/lib/audit-labels";

export const Route = createFileRoute("/_authenticated/payments/$paymentId")({
  head: () => ({
    meta: [
      { title: "Detalle de pago — ZEMGO" },
      { name: "description", content: "Consulta el estado de cobro y los intentos de pago de un certificado ZEMGO." },
    ],
  }),
  component: PaymentDetail,
});

const FREQ_LABELS: Record<string, string> = {
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
  one_time: "Pago único",
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Transferencia bancaria",
  card: "Pago en el portal",
  manual: "Transferencia bancaria",
  bank_reference: "Transferencia bancaria",
  cash: "Transferencia bancaria",
  oxxo: "Pago en el portal",
};

function attemptInfo(p: any): { label: string; tone: string; detail: string } {
  if (p.status === "paid")
    return { label: "Ya pagó", tone: "bg-emerald-100 text-emerald-800 border-emerald-200", detail: "El pago se recibió y quedó conciliado." };
  if (p.status === "failed")
    return { label: "Intentó pagar y falló", tone: "bg-red-100 text-red-800 border-red-200", detail: p.failure_reason ?? "El intento de pago fue rechazado en el portal." };
  if (p.status === "refunded")
    return { label: "Pago reembolsado", tone: "bg-slate-100 text-slate-700 border-slate-200", detail: "El monto se devolvió al cliente." };
  if (p.status === "cancelled")
    return { label: "Pago cancelado", tone: "bg-slate-100 text-slate-700 border-slate-200", detail: p.cancellation_reason ?? "El cobro fue cancelado." };
  if (p.provider_transaction_id || p.control_number)
    return { label: "Intento en proceso", tone: "bg-amber-100 text-amber-800 border-amber-200", detail: "El cliente inició un pago en el portal y está en validación." };
  if (p.status === "overdue")
    return { label: "No ha pagado", tone: "bg-orange-100 text-orange-800 border-orange-200", detail: "La fecha de vencimiento ya pasó y no hay pago registrado." };
  return { label: "Sin intento de pago", tone: "bg-muted text-muted-foreground border-border", detail: "El cliente aún no ha iniciado el pago en el portal." };
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function PaymentDetail() {
  const { paymentId } = Route.useParams();

  const { data: payment } = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "*, policies(id, folio, status, program_id, start_date, end_date, clients(id, first_name, last_name, curp, email, phone), programs(name, code, color_primary))",
        )
        .eq("id", paymentId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const policyId = payment?.policies?.id;

  const { data: schedule } = useQuery({
    queryKey: ["payment-schedule-of-policy", policyId],
    enabled: !!policyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_schedules")
        .select("*")
        .eq("policy_id", policyId)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ["policy-payments-timeline", policyId],
    enabled: !!policyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, due_date, amount, status, paid_at, method")
        .eq("policy_id", policyId)
        .order("due_date", { ascending: true });
      return (data ?? []) as any[];
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

  if (!payment) return <div className="text-muted-foreground">Cargando…</div>;
  const pol = payment.policies;
  const c = pol?.clients;
  const prog = pol?.programs;
  const att = attemptInfo(payment);
  const days = payment.due_date
    ? Math.floor((new Date(payment.due_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/payments"><ArrowLeft className="h-4 w-4 mr-1" />Cobranza</Link>
        </Button>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={payment.status} />
          <Badge variant="outline" className={att.tone}>{att.label}</Badge>
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-3xl font-semibold">${Number(payment.amount).toLocaleString("es-MX")}</div>
          <div className="text-sm text-muted-foreground">
            Vence {payment.due_date ?? "—"}
            {days !== null && (
              <span className={days < 0 ? "text-red-600 font-medium" : ""}>
                {" "}· {days < 0 ? `${Math.abs(days)} días de atraso` : `en ${days} días`}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>{att.detail}</span>
        </div>
      </Card>

      <Card className="p-5 grid md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Cliente</div>
          <Link to="/clients/$clientId" params={{ clientId: c?.id }} className="font-medium text-primary underline">
            {c?.first_name} {c?.last_name}
          </Link>
          <div className="text-xs text-muted-foreground">{c?.curp}</div>
        </div>
        <Field label="Teléfono" value={c?.phone} />
        <Field label="Correo" value={c?.email} />
        <div>
          <div className="text-xs text-muted-foreground">Certificado</div>
          <Link to="/policies/$policyId" params={{ policyId: pol.id }} className="font-mono font-medium text-primary underline">
            {pol.folio}
          </Link>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Programa</div>
          <div className="font-medium inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prog?.color_primary ?? "#999" }} />
            {prog?.name}
          </div>
        </div>
        <Field label="Vigencia" value={pol.start_date ? `${pol.start_date} → ${pol.end_date ?? "—"}` : null} />
        <Field label="Frecuencia" value={schedule ? (FREQ_LABELS[schedule.frequency] ?? schedule.frequency) : "Sin programación"} />
        <Field label="Próximo cobro programado" value={schedule?.next_due_date} />
        <Field label="Recordatorio" value={schedule ? `${schedule.reminder_days_before} días antes` : null} />
        <Field label="Forma de pago" value={payment.method ? (METHOD_LABELS[payment.method] ?? payment.method) : null} />
        <Field label="Pagado el" value={payment.paid_at ? new Date(payment.paid_at).toLocaleString("es-MX") : null} />
        <Field label="Monto cobrado" value={payment.paid_amount ? `$${Number(payment.paid_amount).toLocaleString("es-MX")}` : null} />
        {payment.failure_reason && (
          <div className="md:col-span-3 text-red-700">
            <div className="text-xs">Motivo de la falla</div>
            {payment.failure_reason}
          </div>
        )}
        {payment.notes && (
          <div className="md:col-span-3">
            <div className="text-xs text-muted-foreground">Notas</div>
            <pre className="whitespace-pre-wrap text-sm font-sans">{payment.notes}</pre>
          </div>
        )}
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Pagos de este certificado</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Intento de pago</TableHead>
              <TableHead>Pagado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {siblings.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Sin pagos.</TableCell></TableRow>
            )}
            {siblings.map((s: any) => {
              const a = attemptInfo(s);
              return (
                <TableRow key={s.id} className={s.id === paymentId ? "bg-muted/50" : ""}>
                  <TableCell>{s.due_date ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">${Number(s.amount).toLocaleString("es-MX")}</TableCell>
                  <TableCell><PaymentStatusBadge status={s.status} /></TableCell>
                  <TableCell><Badge variant="outline" className={a.tone}>{a.label}</Badge></TableCell>
                  <TableCell className="text-xs">{s.paid_at ? new Date(s.paid_at).toLocaleDateString("es-MX") : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Historial</div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Fecha</TableHead><TableHead>Acción</TableHead><TableHead>Detalle</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Sin eventos.</TableCell></TableRow>
            )}
            {history.map((h: any) => (
              <TableRow key={h.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(h.created_at).toLocaleString("es-MX")}</TableCell>
                <TableCell className="text-xs">{auditActionLabel(h.action)}</TableCell>
                <TableCell className="text-xs">{describeAuditDiff(h.diff)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
