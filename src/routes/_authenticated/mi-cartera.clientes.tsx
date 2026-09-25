import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortfolioGate, PageHeader, SectionCard, Empty, CLIENT_STATUS } from "@/components/sales/portfolio-ui";

export const Route = createFileRoute("/_authenticated/mi-cartera/clientes")({
  head: () => ({
    meta: [
      { title: "Mis clientes — Portal de vendedores ZEMGO" },
      { name: "description", content: "Tu cartera de clientes con su estado y certificados vigentes." },
      { property: "og:title", content: "Mis clientes — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Tu cartera de clientes con su estado y certificados vigentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const [search, setSearch] = useState("");
  return (
    <PortfolioGate>
      {(data) => {
        const q = search.trim().toLowerCase();
        const rows = data.clients.filter(
          (c) => !q || c.full_name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q),
        );
        return (
          <div className="max-w-6xl">
            <PageHeader
              title="Mis clientes"
              subtitle="Todos los clientes registrados a tu nombre."
              right={
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Buscar por nombre, correo o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              }
            />
            <SectionCard title="Cartera" count={rows.length}>
              {rows.length === 0 ? (
                <Empty text={q ? "Ningún cliente coincide con la búsqueda." : "Todavía no tienes clientes en tu cartera."} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Programa</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Certificados vigentes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => {
                      const st = CLIENT_STATUS[c.status ?? ""] ?? { label: c.status ?? "—", variant: "outline" as const };
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.full_name}</TableCell>
                          <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
                          <TableCell className="text-sm">{c.program_name ?? "—"}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{c.active_policies}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          </div>
        );
      }}
    </PortfolioGate>
  );
}
