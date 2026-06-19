import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge";
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog";

export const Route = createFileRoute("/_authenticated/payments/")({
  head: () => ({ meta: [{ title: "Cobranza — HOPE Consulting" }] }),
  component: PaymentsList,
});

const STATUS_OPTIONS = ["pending", "overdue", "paid", "failed", "refunded", "cancelled"];
const METHOD_OPTIONS = ["bank_transfer", "cash", "bank_reference", "manual", "card", "oxxo"];

function PaymentsList() {
  const { activeProgram, programs } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("active");
  const [statuses, setStatuses] = useState<string[]>(["pending", "overdue"]);
  const [method, setMethod] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const PAGE_SIZE = 25;

  const programId = scope === "active" ? activeProgram?.id : null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payments-list", programId, statuses, method, from, to, search, page],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select(
          "id, amount, due_date, status, method, paid_at, bank_reference, policies!inner(id, folio, program_id, clients!inner(id, first_name, last_name, curp)), programs:policies(programs(id,name,code,color_primary))",
        )
        .order("due_date", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statuses.length) q = q.in("status", statuses as any);
      if (method !== "all") q = q.eq("method", method as any);
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
            (`${c?.first_name ?? ""} ${c?.last_name ?? ""}`).toLowerCase().includes(s) ||
            (c?.curp ?? "").toLowerCase().includes(s)
          );
        });
      }
      // Overdue first
      list.sort((a, b) => {
        const ao = a.status === "overdue" ? 0 : 1;
        const bo = b.status === "overdue" ? 0 : 1;
        if (ao !== bo) return ao - bo;
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
            {scope === "active" ? activeProgram?.name : "Todos los programas"} · {rows.length} pagos
          </p>
        </div>
      </div>


      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-4 gap-3">
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
            <label className="text-xs font-medium">Método</label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {METHOD_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
              <label key={s} className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={statuses.includes(s)} onCheckedChange={() => toggleStatus(s)} />
                {s}
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
              <TableHead>Póliza</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Días</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
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
              return (
                <TableRow key={r.id}>
                  <TableCell>{c?.first_name} {c?.last_name}</TableCell>
                  <TableCell><Link to="/policies/$policyId" params={{ policyId: r.policies.id }} className="font-mono text-xs text-primary underline">{r.policies?.folio}</Link></TableCell>
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
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/payments/$paymentId" params={{ paymentId: r.id }}>Ver</Link>
                    </Button>
                    {(r.status === "pending" || r.status === "overdue") && (
                      <Button size="sm" onClick={() => setSelected(r)}>Marcar pagado</Button>
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

      {selected && (
        <MarkPaidDialog
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
          payment={selected}
        />
      )}
    </div>
  );
}
