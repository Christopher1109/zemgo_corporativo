import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PaymentStatusBadge } from "./payment-status-badge";
import { MarkPaidDialog } from "./mark-paid-dialog";

export function PolicyPaymentsTab({ policyId, policyStatus }: { policyId: string; policyStatus: string }) {
  const [selected, setSelected] = useState<any | null>(null);

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

  const nextPending = payments.find((p) => p.status === "pending" || p.status === "overdue");

  return (
    <div className="space-y-4">
      {policyStatus === "suspended" && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-900 p-3 text-sm dark:bg-red-950 dark:text-red-100 dark:border-red-800">
          Este certificado está suspendido. Para reactivarlo, registra los pagos vencidos.
        </div>
      )}

      {schedule && (
        <Card className="p-4 flex flex-wrap gap-6 text-sm">
          <div><div className="text-xs text-muted-foreground">Frecuencia</div><div className="font-medium">{schedule.frequency}</div></div>
          <div><div className="text-xs text-muted-foreground">Monto</div><div className="font-medium">${Number(schedule.amount).toLocaleString("es-MX")}</div></div>
          <div><div className="text-xs text-muted-foreground">Próximo cobro</div><div className="font-medium">{schedule.next_due_date ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Recordatorio</div><div className="font-medium">{schedule.reminder_days_before} días antes</div></div>
        </Card>
      )}

      <div className="flex justify-end">
        {nextPending && <Button onClick={() => setSelected(nextPending)}>Registrar pago manual</Button>}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin pagos asociados.</TableCell></TableRow>}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.due_date ?? "—"}</TableCell>
                <TableCell className="font-mono">${Number(p.amount).toLocaleString("es-MX")}</TableCell>
                <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                <TableCell>{p.method ?? "—"}</TableCell>
                <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("es-MX") : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/payments/$paymentId" params={{ paymentId: p.id }}>Ver</Link>
                  </Button>
                  {(p.status === "pending" || p.status === "overdue") && (
                    <Button size="sm" onClick={() => setSelected(p)}>Pagar</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {selected && (
        <MarkPaidDialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)} payment={selected} />
      )}
    </div>
  );
}
