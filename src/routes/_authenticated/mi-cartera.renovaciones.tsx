import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { PortfolioGate, PageHeader, SectionCard, RenewalTable } from "@/components/sales/portfolio-ui";

export const Route = createFileRoute("/_authenticated/mi-cartera/renovaciones")({
  head: () => ({
    meta: [
      { title: "Renovaciones — Portal de vendedores ZEMGO" },
      { name: "description", content: "Certificados por vencer, vencidos sin renovar y renovados de tu cartera." },
      { property: "og:title", content: "Renovaciones — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Certificados por vencer, vencidos sin renovar y renovados de tu cartera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RenovacionesPage,
});

function RenovacionesPage() {
  return (
    <PortfolioGate>
      {(data) => (
        <div className="max-w-6xl space-y-6">
          <PageHeader title="Renovaciones" subtitle="Contacta a tus clientes antes de que venza su certificado." />
          <SectionCard title="Por vencer (60 días)" count={data.renewals.expiring.length}>
            <RenewalTable
              rows={data.renewals.expiring}
              empty="No tienes certificados por vencer en los próximos 60 días."
              extra={(r) => (
                <Badge variant={(r.days_to_expire ?? 99) <= 10 ? "destructive" : "secondary"}>vence en {r.days_to_expire} días</Badge>
              )}
            />
          </SectionCard>
          <SectionCard title="Vencidos sin renovar" count={data.renewals.expired_unrenewed.length}>
            <RenewalTable rows={data.renewals.expired_unrenewed} empty="No tienes certificados vencidos pendientes." extra={() => <Badge variant="destructive">vencido</Badge>} />
          </SectionCard>
          <SectionCard title="Renovados" count={data.renewals.renewed.length}>
            <RenewalTable rows={data.renewals.renewed} empty="Aún no hay certificados renovados." extra={() => <Badge>renovado</Badge>} />
          </SectionCard>
        </div>
      )}
    </PortfolioGate>
  );
}
