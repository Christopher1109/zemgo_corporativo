import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";

export const Route = createFileRoute("/_authenticated/payments/")({
  head: () => ({
    meta: [
      { title: "Cobranza — ZEMGO" },
      { name: "description", content: "Próximos pagos y estado de cobro de los certificados ZEMGO." },
    ],
  }),
  component: PaymentsList,
});

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Por pagar" },
  { value: "overdue", label: "Vencido" },
  { value: "failed", label: "Intento fallido" },
  { value: "paid", label: "Pagado" },
  { value: "refunded", label: "Reembolsado" },
  { value: "cancelled", label: "Cancelado" },
];

/** Estado del intento de cobro, derivado del pago (todo se procesa en el portal del cliente). */
function attemptInfo(p: any): { label: string; tone: string } {
  if (p.status === "paid") return { label: "Ya pagó", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (p.status === "failed") return { label: "Intentó pagar y falló", tone: "bg-red-100 text-red-800 border-red-200" };
  if (p.status === "refunded") return { label: "Pago reembolsado", tone: "bg-slate-100 text-slate-700 border-slate-200" };
  if (p.status === "cancelled") return { label: "Pago cancelado", tone: "bg-slate-100 text-slate-700 border-slate-200" };
  if (p.provider_transaction_id || p.control_number)
    return { label: "Intento en proceso", tone: "bg-amber-100 text-amber-800 border-amber-200" };
  if (p.status === "overdue") return { label: "No ha pagado", tone: "bg-orange-100 text-orange-800 border-orange-200" };
  return { label: "Sin intento de pago", tone: "bg-muted text-muted-foreground border-border" };
}

function PaymentsList() {
  const { activeProgram, programs } = useProgram();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"active" | "all">("active");
  const [statuses, setStatuses] = useState<string[]>(["pending", "overdue", "failed"]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const programId = scope === "active" ? activeProgram?.id : null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payments-list", programId, statuses, from, to, search, page],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id, amount, paid_amount, due_date, status, method, paid_at, provider, provider_transaction_id, control_number, failure_reason, policies!inner(id, folio, program_id, clients!inner(id, first_name, last_name, curp)), programs:policies(programs(id,name,code,color_primary))",
        )
        .order("due_date", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statuses.length) q = q.in("status", statuses as any);
      if (from) q = q.gte("due_date", from);
      if (to) q = q.lte("due_date", to);
      if (programId) q = q.eq("policies.program_id", programId);
      const { data, error } = await q;
      if (error) throw error;
      let list = (data ?? []) as any[];
      const s = search.trim().toLowerCase();
      if (s) {
        list = list.filter((r) => {
          const c = r.policies?.clients;
          return (
            (r.policies?.folio ?? "").toLowerCase().includes(s) ||
            `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.toLowerCase().includes(s) ||
            (c?.curp ?? "").toLowerCase().includes(s)
          );
        });
      }
      list.sort((a, b) => {
        const rank = (x: any) => (x.status === "overdue" ? 0 : x.status === "failed" ? 1 : 2);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (a.due_date ?? "").localeCompare(b.due_date ?? "");
      });
      return list;
    },
  });

  const toggleStatus = (s: string) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cobranza</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "active" ? activeProgram?.name : "Todos los programas"} · {rows.length} pagos ·
            solo consulta, los cobros se realizan en el portal del cliente
          </p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium">Programa</label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{activeProgram?.name ?? "Activo"}</SelectItem>
                <SelectItem value="all">Todos ({programs.length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Vencimiento desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Vencimiento hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs font-medium">Buscador</label>
            <Input placeholder="Folio, nombre o CURP" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-3">
            {STATUS_OPTIONS.map((s) => (
              <label key={s.value} className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={statuses.includes(s.value)} onCheckedChange={() => toggleStatus(s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Días</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Intento de pago</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin pagos.</TableCell></TableRow>
            )}
            {rows.map((r: any) => {
              const c = r.policies?.clients;
              const prog = r.policies?.programs;
              const days = r.due_date
                ? Math.floor((new Date(r.due_date).getTime() - Date.now()) / 86400000)
                : null;
              const att = attemptInfo(r);
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/payments/$paymentId", params: { paymentId: r.id } })}
                >
                  <TableCell>{c?.first_name} {c?.last_name}</TableCell>
                  <TableCell>
                    <Link
                      to="/policies/$policyId"
                      params={{ policyId: r.policies.id }}
                      className="font-mono text-xs text-primary underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.policies?.folio}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prog?.color_primary ?? "#999" }} />
                      {prog?.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">${Number(r.amount).toLocaleString("es-MX")}</TableCell>
                  <TableCell>{r.due_date ?? "—"}</TableCell>
                  <TableCell className={days !== null && days < 0 ? "text-red-600 font-medium" : ""}>
                    {days === null ? "—" : days < 0 ? `${Math.abs(days)} atras.` : `${days}`}
                  </TableCell>
                  <TableCell><PaymentStatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={att.tone}>{att.label}</Badge>
                    {r.failure_reason && (
                      <div className="text-[11px] text-red-700 mt-0.5 max-w-[220px] truncate">{r.failure_reason}</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
        <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
