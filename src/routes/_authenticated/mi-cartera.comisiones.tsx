import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, RefreshCw, Wallet, PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortfolioGate, PageHeader, SectionCard, KpiCard, Empty, money, fmtDate } from "@/components/sales/portfolio-ui";

export const Route = createFileRoute("/_authenticated/mi-cartera/comisiones")({
  head: () => ({
    meta: [
      { title: "Comisiones — Portal de vendedores ZEMGO" },
      { name: "description", content: "Tus comisiones: 20% por clientes nuevos y 10% por renovaciones." },
      { property: "og:title", content: "Comisiones — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Tus comisiones: 20% por clientes nuevos y 10% por renovaciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComisionesPage,
});

function ComisionesPage() {
  return (
    <PortfolioGate>
      {(data) => (
        <div className="max-w-6xl space-y-6">
          <PageHeader title="Comisiones" subtitle="20% en el primer pago de clientes nuevos, 10% en renovaciones." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Sparkles} label="Nuevos del mes" value={money(data.commissions.new_this_month)} />
            <KpiCard icon={RefreshCw} label="Renovaciones del mes" value={money(data.commissions.renewals_this_month)} />
            <KpiCard icon={Wallet} label="Total del mes" value={money(data.commissions.total_this_month)} />
            <KpiCard icon={PiggyBank} label="Histórico" value={money(data.commissions.total_historic)} />
          </div>
          <SectionCard title="Detalle" count={data.commissions.detail.length}>
            {data.commissions.detail.length === 0 ? (
              <Empty text="Todavía no tienes comisiones. Se generan cuando tus clientes pagan desde el portal." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Folio</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.commissions.detail.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.client_name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.folio ?? "—"}</TableCell>
                      <TableCell>{fmtDate(c.paid_at)}</TableCell>
                      <TableCell><Badge variant={c.kind === "new" ? "default" : "secondary"}>{c.kind === "new" ? "Nuevo" : "Renovación"}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.base_amount ?? 0)}</TableCell>
                      <TableCell className="text-right">{Math.round((c.rate ?? 0) * 100)}%</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(c.amount ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
      )}
    </PortfolioGate>
  );
}
