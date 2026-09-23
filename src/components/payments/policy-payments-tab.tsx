import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PaymentStatusBadge } from "./payment-status-badge";

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

export function PolicyPaymentsTab({ policyId, policyStatus }: { policyId: string; policyStatus: string }) {
  const navigate = useNavigate();

  const { data: payments = [] } = useQuery({
    queryKey: ["policy-payments-full", policyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("policy_id", policyId)
        .order("due_date", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const { data: schedule } = useQuery({
    queryKey: ["policy-schedule", policyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_schedules")
        .select("*")
        .eq("policy_id", policyId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="space-y-4">
      {policyStatus === "suspended" && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-900 p-3 text-sm dark:bg-red-950 dark:text-red-100 dark:border-red-800">
          Este certificado está suspendido. Se reactiva cuando el cliente liquida los pagos vencidos desde el portal.
        </div>
      )}

      {schedule ? (
        <Card className="p-4 flex flex-wrap gap-6 text-sm">
          <div><div className="text-xs text-muted-foreground">Frecuencia</div><div className="font-medium">{FREQ_LABELS[schedule.frequency] ?? schedule.frequency}</div></div>
          <div><div className="text-xs text-muted-foreground">Monto</div><div className="font-medium">${Number(schedule.amount).toLocaleString("es-MX")}</div></div>
          <div><div className="text-xs text-muted-foreground">Próximo cobro</div><div className="font-medium">{schedule.next_due_date ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Recordatorio</div><div className="font-medium">{schedule.reminder_days_before} días antes</div></div>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">Sin programación de pago.</Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Forma de pago</TableHead>
              <TableHead>Pagado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin pagos asociados.</TableCell></TableRow>}
            {payments.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/payments/$paymentId", params: { paymentId: p.id } })}
              >
                <TableCell>{p.due_date ?? "—"}</TableCell>
                <TableCell className="font-mono">${Number(p.amount).toLocaleString("es-MX")}</TableCell>
                <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                <TableCell>{p.method ? (METHOD_LABELS[p.method] ?? p.method) : "—"}</TableCell>
                <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("es-MX") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
