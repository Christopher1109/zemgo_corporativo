import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { portalPayments, portalGenerateBankReference } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/portal/_app/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const fn = useServerFn(portalPayments);
  const gen = useServerFn(portalGenerateBankReference);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portal", "payments"], queryFn: () => fn() });
  const [cardOpen, setCardOpen] = useState(false);
  const mut = useMutation({
    mutationFn: (id: string) => gen({ data: { payment_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal", "payments"] }),
    onError: () => toast.error("No fue posible generar la referencia"),
  });

  if (isLoading) return <div className="text-slate-500">Cargando…</div>;
  const all = ((data as any[]) ?? []);
  const pending = all.filter((p) => p.status === "pending" || p.status === "overdue");
  const paid = all.filter((p) => p.status === "paid");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mis Pagos</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Pendientes</h2>
        {pending.length === 0 && <p className="text-sm text-slate-500">Sin pagos pendientes.</p>}
        {pending.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold">${Number(p.amount).toLocaleString("es-MX")}</div>
                  <div className="text-xs text-slate-500">
                    {p.policy?.program_code} · Folio {p.policy?.folio} · Vence {p.due_date}
                  </div>
                  {p.status === "overdue" && (
                    <div className="mt-1 inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Vencido</div>
                  )}
                </div>
              </div>

              {p.bank_reference ? (
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Referencia bancaria</div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm font-bold">{p.bank_reference}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(p.bank_reference);
                        toast.success("Referencia copiada");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setCardOpen(true)}>Pagar con tarjeta</Button>
                <Button size="sm" variant="outline" onClick={() => mut.mutate(p.id)} disabled={mut.isPending}>
                  {p.bank_reference ? "Regenerar referencia" : "Generar referencia bancaria"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-slate-500">Histórico</h2>
        {paid.length === 0 && <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>}
        {paid.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="font-medium">${Number(p.paid_amount ?? p.amount).toLocaleString("es-MX")}</div>
                <div className="text-xs text-slate-500">{p.policy?.program_code} · {p.paid_at?.slice(0, 10)}</div>
              </div>
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Pagado</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pago con tarjeta</DialogTitle>
            <DialogDescription>
              Próximamente disponible vía Banorte. Mientras tanto, genera tu referencia bancaria.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
