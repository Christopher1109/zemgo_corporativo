import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMySalesRepPortfolio, type PortfolioRenewal, type PortfolioPayment } from "@/lib/sales-rep-portfolio.functions";
import { useProgram } from "@/lib/program-context";
import { toast } from "sonner";

export const PROGRAM_FORM_URLS: Record<string, string> = {
  ABC: "https://www.zemgoseguros.com.mx/abc-de-proteccion",
  MCV: "https://www.zemgoseguros.com.mx/manos-con-valor",
  FUTCARE: "https://www.zemgoseguros.com.mx/fut-care",
};

export const money = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

export const fmtDate = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function usePortfolio() {
  const { activeProgram } = useProgram();
  const fetchPortfolio = useServerFn(getMySalesRepPortfolio);
  return useQuery({
    queryKey: ["my-sales-rep-portfolio", activeProgram?.id ?? null],
    queryFn: () => fetchPortfolio({ data: { programId: activeProgram?.id ?? null } }),
  });
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Liga copiada");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-1.5">{copied ? "Copiada" : "Copiar"}</span>
    </Button>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

export function PortfolioGate({ children }: { children: (d: NonNullable<ReturnType<typeof usePortfolio>["data"]>) => ReactNode }) {
  const { data, isLoading } = usePortfolio();
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-muted/50 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />)}
        </div>
      </div>
    );
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
  return <>{children(data)}</>;
}

export function KpiCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
      <CardContent className="p-5 flex items-start gap-4">
        <div
          className="h-11 w-11 shrink-0 rounded-xl grid place-items-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--program-primary, #0f2a4a) 12%, transparent)", color: "var(--program-primary, #0f2a4a)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums truncate">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export const CLIENT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  prospect: { label: "Prospecto", variant: "secondary" },
  inactive: { label: "Inactivo", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

export function SectionCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <Card className="border-0 shadow-sm ring-1 ring-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      </div>
      {children}
    </Card>
  );
}

export function RenewalTable({ rows, empty, extra }: { rows: PortfolioRenewal[]; empty: string; extra: (r: PortfolioRenewal) => ReactNode }) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Folio</TableHead>
          <TableHead>Vigencia</TableHead>
          <TableHead>Contacto</TableHead>
          <TableHead className="text-right">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.policy_id}>
            <TableCell className="font-medium">{r.client_name}</TableCell>
            <TableCell className="font-mono text-xs">{r.folio ?? "—"}</TableCell>
            <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</TableCell>
            <TableCell className="text-sm">
              <div>{r.client_phone ?? "—"}</div>
              <div className="text-muted-foreground text-xs">{r.client_email ?? ""}</div>
            </TableCell>
            <TableCell className="text-right">{extra(r)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PaymentTable({ rows, empty, overdue }: { rows: PortfolioPayment[]; empty: string; overdue?: boolean }) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Folio</TableHead>
          <TableHead>Vence</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead className="text-right">Tu comisión</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.client_name}</TableCell>
            <TableCell className="font-mono text-xs">{p.folio ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">
              {fmtDate(p.due_date)}
              {overdue && <Badge variant="destructive" className="ml-2">vencido</Badge>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{money(p.amount)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {money(p.estimated_commission)}{" "}
              <span className="text-xs text-muted-foreground">({Math.round(p.commission_rate * 100)}%)</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
