import { createFileRoute } from "@tanstack/react-router";
import { PortfolioGate, PageHeader, SectionCard, PaymentTable } from "@/components/sales/portfolio-ui";

export const Route = createFileRoute("/_authenticated/mi-cartera/pagos")({
  head: () => ({
    meta: [
      { title: "Pagos — Portal de vendedores ZEMGO" },
      { name: "description", content: "Pagos vencidos y próximos cobros de tus clientes con tu comisión estimada." },
      { property: "og:title", content: "Pagos — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Pagos vencidos y próximos cobros de tus clientes con tu comisión estimada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagosPage,
});

function PagosPage() {
  return (
    <PortfolioGate>
      {(data) => (
        <div className="max-w-6xl space-y-6">
          <PageHeader title="Pagos" subtitle="Solo consulta. Tus clientes pagan desde su portal." />
          <SectionCard title="Pagos vencidos" count={data.payments.overdue.length}>
            <PaymentTable rows={data.payments.overdue} empty="No hay pagos vencidos en tu cartera." overdue />
          </SectionCard>
          <SectionCard title="Próximos cobros (60 días)" count={data.payments.upcoming.length}>
            <PaymentTable rows={data.payments.upcoming} empty="No hay cobros programados en los próximos 60 días." />
          </SectionCard>
        </div>
      )}
    </PortfolioGate>
  );
}
