import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { RefreshCw, Download, Loader2, CalendarClock, Wallet, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProgram } from "@/lib/program-context";
import { newWorkbook, styleHeader, downloadWorkbook } from "@/lib/client-excel";
import {
  fetchRenewals, hasRenewals, monthRange, monthFromToday, monthLabel,
  RENEWAL_STATUS_LABEL, RENEWAL_STATUS_CLASS, type RenewalRow, type RenewalStatus,
} from "@/lib/renewals";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/_authenticated/renewals")({
  head: () => ({ meta: [{ title: "Renovaciones — ZEMGO" }] }),
  validateSearch: searchSchema,
  component: RenewalsPage,
});

const fmtMoney = (n: number) => `$${(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");

type Filter = "todos" | RenewalStatus;

function RenewalsPage() {
  const { activeProgram } = useProgram();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/renewals" });
  const month = search.month ?? monthFromToday(1);
  const setMonth = (m: string) => navigate({ search: { month: m }, replace: true });
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const enabled = !!activeProgram?.id && hasRenewals(activeProgram?.code);
  const { from, to } = monthRange(month);
  const query = useQuery({
    queryKey: ["renewals", activeProgram?.id, month],
    queryFn: () => fetchRenewals(activeProgram!.id, from, to),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const rows = query.data ?? [];

  const stats = useMemo(() => {
    const by = (s: RenewalStatus) => rows.filter((r) => r.renewal_status === s);
    const notCancelled = rows.filter((r) => r.renewal_status !== "cancelado");
    return {
      total: notCancelled.length,
      pendiente: by("pendiente").length,
      renovado: by("renovado").length,
      vencido: by("vencido").length,
      cancelado: by("cancelado").length,
      esperado: notCancelled.reduce((s, r) => s + r.expected_amount, 0),
      recibido: rows.reduce((s, r) => s + r.paid_amount, 0),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (filter === "todos" || r.renewal_status === filter) &&
      (!t || [r.client_name, r.folio, r.certificate_number, r.curp, r.phone, r.email].some((v) => String(v ?? "").toLowerCase().includes(t))),
    );
  }, [rows, filter, q]);

  async function exportExcel() {
    setExporting(true);
    try {
      const wb = await newWorkbook();
      const ws = wb.addWorksheet("Renovaciones");
      ws.columns = ["Cliente", "CURP", "Teléfono", "Correo", "Folio", "N° certificado", "Inicio de vigencia", "Fin de vigencia", "Estado de renovación", "Monto esperado", "Monto recibido", "Fecha de pago"]
        .map((h) => ({ header: h, key: h }));
      for (const r of visible) {
        ws.addRow([
          r.client_name, r.curp ?? "", r.phone ?? "", r.email ?? "", r.folio ?? "", r.certificate_number ?? "",
          r.start_date ?? "", r.end_date, RENEWAL_STATUS_LABEL[r.renewal_status],
          r.renewal_status === "cancelado" ? 0 : r.expected_amount, r.paid_amount,
          r.paid_at ? new Date(r.paid_at).toLocaleDateString("es-MX") : "",
        ]);
      }
      styleHeader(ws);
      ws.getColumn(1).width = 36;
      ws.getColumn(10).numFmt = '"$"#,##0.00';
      ws.getColumn(11).numFmt = '"$"#,##0.00';
      await downloadWorkbook(wb, `renovaciones-${activeProgram?.code}-${month}.xlsx`);
    } finally { setExporting(false); }
  }

  if (!activeProgram) return <Card className="p-8 text-center text-muted-foreground">Selecciona un programa.</Card>;
  if (!hasRenewals(activeProgram.code)) {
    return <Card className="p-8 text-center text-muted-foreground">Renovaciones está disponible solo para FutCare y Manos con Valor.</Card>;
  }

  const quick = [
    { label: "Este mes", value: monthFromToday(0) },
    { label: "Próximo mes", value: monthFromToday(1) },
    { label: "En 2 meses", value: monthFromToday(2) },
  ];

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{activeProgram.name}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <RefreshCw className="h-6 w-6" style={{ color: "var(--program-primary)" }} /> Renovaciones
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Clientes cuya vigencia termina en el mes elegido y cómo va su renovación.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {quick.map((x) => (
            <Button key={x.value} size="sm" variant={month === x.value ? "default" : "outline"} onClick={() => setMonth(x.value)}>{x.label}</Button>
          ))}
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-full sm:w-[170px]" />
        </div>
      </div>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        <Kpi icon={CalendarClock} label={`Por renovar · ${monthLabel(month)}`} value={String(stats.total)} sub="Sin contar cancelados" loading={query.isLoading} />
        <Kpi icon={Wallet} label="Se espera recibir" value={fmtMoney(stats.esperado)} loading={query.isLoading} />
        <Kpi icon={CheckCircle2} label="Recibido" value={fmtMoney(stats.recibido)} sub={`${stats.renovado} renovados`} tone="ok" loading={query.isLoading} />
        <Kpi icon={RefreshCw} label="Pendientes" value={String(stats.pendiente)} sub="Aún no vencen" loading={query.isLoading} />
        <Kpi icon={AlertTriangle} label="Vencidos sin renovar" value={String(stats.vencido)} tone="danger" loading={query.isLoading} />
        <Kpi icon={XCircle} label="Cancelados" value={String(stats.cancelado)} loading={query.isLoading} />
      </section>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["todos", "pendiente", "vencido", "renovado", "cancelado"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "todos" ? `Todos (${rows.length})` : `${RENEWAL_STATUS_LABEL[f]} (${rows.filter((r) => r.renewal_status === f).length})`}
              </Button>
            ))}
          </div>
          <div className="flex w-full sm:w-auto flex-wrap gap-2">
            <Input placeholder="Buscar nombre, folio, CURP o teléfono" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-[280px]" />
            <Button onClick={exportExcel} disabled={exporting || visible.length === 0} className="w-full sm:w-auto">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar Excel ({visible.length})
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />)}</div>
        ) : query.error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las renovaciones: {(query.error as any)?.message}</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay renovaciones en {monthLabel(month).toLowerCase()} con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Folio</TableHead><TableHead>Teléfono</TableHead>
                <TableHead>Fin de vigencia</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead><TableHead>Pagado el</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visible.map((r) => <Row key={r.policy_id} r={r} />)}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ r }: { r: RenewalRow }) {
  return (
    <TableRow>
      <TableCell>
        <Link to="/clients/$clientId" params={{ clientId: r.client_id }} className="font-medium hover:underline">{r.client_name}</Link>
        {r.email && <div className="text-[11px] text-muted-foreground truncate max-w-[240px]">{r.email}</div>}
      </TableCell>
      <TableCell>
        <Link to="/policies/$policyId" params={{ policyId: r.policy_id }} className="font-mono text-xs text-primary underline">{r.folio}</Link>
        {r.certificate_number && <div className="text-[11px] text-muted-foreground">Cert. {r.certificate_number}</div>}
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">{r.phone ?? <span className="text-muted-foreground">Sin teléfono</span>}</TableCell>
      <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.end_date)}</TableCell>
      <TableCell className="text-right font-mono">
        {r.renewal_status === "cancelado" ? "—" : fmtMoney(r.renewal_status === "renovado" ? r.paid_amount || r.expected_amount : r.expected_amount)}
      </TableCell>
      <TableCell><Badge variant="outline" className={cn("font-medium", RENEWAL_STATUS_CLASS[r.renewal_status])}>{RENEWAL_STATUS_LABEL[r.renewal_status]}</Badge></TableCell>
      <TableCell className="text-xs whitespace-nowrap">
        {r.renewal_payment_id
          ? <Link to="/payments/$paymentId" params={{ paymentId: r.renewal_payment_id }} className="underline text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleDateString("es-MX") : "Ver cobro"}</Link>
          : "—"}
      </TableCell>
    </TableRow>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone, loading }: { icon: any; label: string; value: string; sub?: string; tone?: "ok" | "danger"; loading?: boolean }) {
  return (
    <Card className="p-4 rounded-2xl shadow-card border-border/70">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-snug">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
      </div>
      {loading ? <div className="h-8 w-16 rounded bg-muted animate-pulse mt-2" /> : (
        <div
          className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", tone === "danger" && "text-destructive", tone === "ok" && "text-emerald-700")}
          style={!tone ? { color: "var(--program-primary)" } : undefined}
        >{value}</div>
      )}
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
