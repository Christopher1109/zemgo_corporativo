import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, Link2, Users, FileText, Wallet, CalendarClock, PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMySalesRepPortfolio } from "@/lib/sales-rep-portfolio.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mi-cartera")({
  head: () => ({
    meta: [
      { title: "Mi cartera — Portal de vendedores ZEMGO" },
      { name: "description", content: "Consulta tu cartera de clientes, renovaciones, pagos y comisiones." },
      { property: "og:title", content: "Mi cartera — Portal de vendedores ZEMGO" },
      { property: "og:description", content: "Consulta tu cartera de clientes, renovaciones, pagos y comisiones." },
    ],
  }),
  component: MiCarteraPage,
});

const PROGRAM_FORM_URLS: Record<string, string> = {
  ABC: "https://www.zemgoseguros.com.mx/abc-de-proteccion",
  MCV: "https://www.zemgoseguros.com.mx/manos-con-valor",
  FUTCARE: "https://www.zemgoseguros.com.mx/fut-care",
};

const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

const fmtDate = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX") : "—";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copiado");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

const CLIENT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  prospect: { label: "Prospecto", variant: "secondary" },
  inactive: { label: "Inactivo", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

function MiCarteraPage() {
  const fetchPortfolio = useServerFn(getMySalesRepPortfolio);
  const { data, isLoading } = useQuery({
    queryKey: ["my-sales-rep-portfolio"],
    queryFn: () => fetchPortfolio(),
  });
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="h-64 rounded-md bg-muted/40 animate-pulse" />;
  }
  if (!data) {
    return (
      <Card className="max-w-lg mx-auto mt-10">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Tu usuario no está ligado a un vendedor activo. Pide a un administrador que ligue tu cuenta.
        </CardContent>
      </Card>
    );
  }

  const ref = data.rep.ref_slug || data.rep.code || "";
  const links = Object.entries(PROGRAM_FORM_URLS).map(([code, url]) => ({
    code,
    url: ref ? `${url}?ref=${ref}` : url,
  }));

  const q = search.trim().toLowerCase();
  const filteredClients = data.clients.filter(
    (c) =>
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hola, {data.rep.full_name}</h1>
          <p className="text-sm text-muted-foreground">Esta es tu cartera. Comparte tu liga para registrar clientes.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Tus ligas de registro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {links.map((l) => (
            <div key={l.code} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{l.code}</Badge>
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{l.url}</code>
              <CopyButton text={l.url} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Users} label="Clientes" value={String(data.kpis.clients)} />
        <Kpi icon={FileText} label="Certificados vigentes" value={String(data.kpis.active_policies)} />
        <Kpi icon={Wallet} label="Comisión del mes" value={money(data.kpis.commission_month)} />
        <Kpi icon={PiggyBank} label="Comisión del año" value={money(data.kpis.commission_year)} />
        <Kpi icon={CalendarClock} label="Por cobrar (60 días)" value={money(data.kpis.commission_next_60d)} />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="renewals">Renovaciones</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
        </TabsList>

        {/* Clientes */}
        <TabsContent value="clients" className="space-y-4">
          <Input
            placeholder="Buscar por nombre, correo o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Programa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Certificados vigentes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((c) => {
                  const st = CLIENT_STATUS[c.status ?? ""] ?? { label: c.status ?? "—", variant: "outline" as const };
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="text-sm">
                        <div>{c.email ?? "—"}</div>
                        <div className="text-muted-foreground">{c.phone ?? ""}</div>
                      </TableCell>
                      <TableCell>{c.program_name ?? "—"}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right">{c.active_policies}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredClients.length === 0 && (
              <Empty text={q ? "Ningún cliente coincide con la búsqueda." : "Todavía no tienes clientes en tu cartera."} />
            )}
          </Card>
        </TabsContent>

        {/* Renovaciones */}
        <TabsContent value="renewals" className="space-y-6">
          <RenewalSection
            title="Por vencer (60 días)"
            rows={data.renewals.expiring}
            empty="No tienes certificados por vencer en los próximos 60 días."
            extra={(r) => (
              <Badge variant={r.days_to_expire! <= 10 ? "destructive" : "secondary"}>
                vence en {r.days_to_expire} días
              </Badge>
            )}
          />
          <RenewalSection
            title="Vencidos sin renovar"
            rows={data.renewals.expired_unrenewed}
            empty="No tienes certificados vencidos pendientes de renovar."
            extra={() => <Badge variant="destructive">vencido</Badge>}
          />
          <RenewalSection
            title="Renovados"
            rows={data.renewals.renewed}
            empty="Aún no hay certificados renovados."
            extra={() => <Badge variant="default">renovado</Badge>}
          />
        </TabsContent>

        {/* Pagos */}
        <TabsContent value="payments" className="space-y-6">
          <PaymentSection
            title="Pagos vencidos"
            rows={data.payments.overdue}
            empty="No hay pagos vencidos en tu cartera."
            overdue
          />
          <PaymentSection
            title="Próximos cobros (60 días)"
            rows={data.payments.upcoming}
            empty="No hay cobros programados en los próximos 60 días."
          />
        </TabsContent>

        {/* Comisiones */}
        <TabsContent value="commissions" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Nuevos del mes" value={money(data.commissions.new_this_month)} />
            <Kpi label="Renovaciones del mes" value={money(data.commissions.renewals_this_month)} />
            <Kpi label="Cobrado total del mes" value={money(data.commissions.total_this_month)} />
            <Kpi label="Comisión histórica" value={money(data.commissions.total_historic)} />
          </div>
          <Card>
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
                    <TableCell>{c.folio ?? "—"}</TableCell>
                    <TableCell>{fmtDate(c.paid_at)}</TableCell>
                    <TableCell>
                      <Badge variant={c.kind === "new" ? "default" : "secondary"}>
                        {c.kind === "new" ? "Nuevo" : "Renovación"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{money(c.base_amount ?? 0)}</TableCell>
                    <TableCell className="text-right">{Math.round((c.rate ?? 0) * 100)}%</TableCell>
                    <TableCell className="text-right font-medium">{money(c.amount ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.commissions.detail.length === 0 && (
              <Empty text="Todavía no tienes comisiones. Se generan cuando tus clientes pagan desde el portal." />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <div className="mt-1 text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RenewalSection({
  title,
  rows,
  empty,
  extra,
}: {
  title: string;
  rows: import("@/lib/sales-rep-portfolio.functions").PortfolioRenewal[];
  empty: string;
  extra: (r: import("@/lib/sales-rep-portfolio.functions").PortfolioRenewal) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.policy_id}>
                <TableCell className="font-medium">{r.client_name}</TableCell>
                <TableCell>{r.folio ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                </TableCell>
                <TableCell className="text-sm">
                  <div>{r.client_email ?? "—"}</div>
                  <div className="text-muted-foreground">{r.client_phone ?? ""}</div>
                </TableCell>
                <TableCell className="text-right">{extra(r)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <Empty text={empty} />}
      </CardContent>
    </Card>
  );
}

function PaymentSection({
  title,
  rows,
  empty,
  overdue,
}: {
  title: string;
  rows: import("@/lib/sales-rep-portfolio.functions").PortfolioPayment[];
  empty: string;
  overdue?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Comisión estimada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.client_name}</TableCell>
                <TableCell>{p.folio ?? "—"}</TableCell>
                <TableCell>
                  {fmtDate(p.due_date)}{" "}
                  {overdue && <Badge variant="destructive" className="ml-1">vencido</Badge>}
                </TableCell>
                <TableCell className="text-right">{money(p.amount)}</TableCell>
                <TableCell className="text-right">
                  {money(p.estimated_commission)}{" "}
                  <span className="text-xs text-muted-foreground">({Math.round(p.commission_rate * 100)}%)</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <Empty text={empty} />}
      </CardContent>
    </Card>
  );
}
