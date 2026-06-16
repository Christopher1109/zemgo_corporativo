import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/payments/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard de cobranza — HOPE Consulting" }] }),
  component: PaymentsDashboard,
});

function PaymentsDashboard() {
  const { activeProgram, programs } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("active");
  const programId = scope === "active" ? activeProgram?.id : null;

  const { data: payments = [] } = useQuery({
    queryKey: ["payments-dashboard", programId],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("id, amount, paid_amount, status, method, due_date, paid_at, policies!inner(program_id, client_id, clients(first_name, last_name), programs(name, code, color_primary))")
        .gte("due_date", new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
      if (programId) q = q.eq("policies.program_id", programId);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const kpis = useMemo(() => {
    let collected = 0, pending = 0, overdue = 0, paidThisMonth = 0, paidCount = 0, failedCount = 0, paidOnlyThisMonth = 0, overdueThisMonth = 0;
    for (const p of payments) {
      const amt = Number(p.paid_amount ?? p.amount);
      if (p.status === "paid" && p.paid_at && new Date(p.paid_at) >= monthStart) {
        paidThisMonth += amt; paidCount++; paidOnlyThisMonth += amt;
      }
      if (p.status === "pending" || p.status === "overdue") pending += Number(p.amount);
      if (p.status === "overdue") { overdue += Number(p.amount); overdueThisMonth += Number(p.amount); }
      if (p.status === "failed") failedCount++;
      if (p.status === "paid") collected += amt;
    }
    const rate = (paidOnlyThisMonth + overdueThisMonth) > 0
      ? (paidOnlyThisMonth / (paidOnlyThisMonth + overdueThisMonth)) * 100
      : 0;
    return { collected: paidThisMonth, pending, overdue, rate, paidCount, failedCount };
  }, [payments, monthStart]);

  // Monthly series per program (12m)
  const monthly = useMemo(() => {
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const byMonth: Record<string, any> = Object.fromEntries(months.map((m) => [m, { month: m }]));
    for (const p of payments) {
      if (p.status !== "paid" || !p.paid_at) continue;
      const m = String(p.paid_at).slice(0, 7);
      if (!byMonth[m]) continue;
      const code = p.policies?.programs?.code ?? "—";
      byMonth[m][code] = (byMonth[m][code] ?? 0) + Number(p.paid_amount ?? p.amount);
    }
    return Object.values(byMonth);
  }, [payments]);

  const topDebtors = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }>();
    for (const p of payments) {
      if (p.status !== "overdue" && p.status !== "pending") continue;
      const c = p.policies?.clients;
      const key = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "—";
      const cur = map.get(key) ?? { name: key, amount: 0 };
      cur.amount += Number(p.amount);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [payments]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (p.status !== "paid" || !p.paid_at) continue;
      if (new Date(p.paid_at) < monthStart) continue;
      const m = p.method ?? "—";
      map.set(m, (map.get(m) ?? 0) + Number(p.paid_amount ?? p.amount));
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [payments, monthStart]);

  const primary = activeProgram?.color_primary ?? "#666";
  const COLORS = programs.map((p) => p.color_primary);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/payments"><ArrowLeft className="h-4 w-4 mr-1" />Cobranza</Link></Button>
          <h1 className="text-2xl font-semibold">Dashboard de cobranza</h1>
        </div>
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{activeProgram?.name}</SelectItem>
            <SelectItem value="all">Todos los programas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        <KPI label="Cobrado este mes" value={`$${kpis.collected.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} color={primary} />
        <KPI label="Pendiente de cobro" value={`$${kpis.pending.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} />
        <KPI label="Vencido" value={`$${kpis.overdue.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} color="#dc2626" />
        <KPI label="Tasa de cobranza" value={`${kpis.rate.toFixed(1)}%`} color={primary} />
        <KPI label="Pagos exitosos / fallidos" value={`${kpis.paidCount} / ${kpis.failedCount}`} />
      </div>

      <Card className="p-4">
        <div className="font-medium mb-3">Cobranza mensual (últimos 12 meses)</div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              {programs.map((p, i) => (
                <Line key={p.code} type="monotone" dataKey={p.code} stroke={p.color_primary} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-medium mb-3">Top 10 clientes con adeudo</div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={topDebtors} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={140} />
                <Tooltip />
                <Bar dataKey="amount" fill={primary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-medium mb-3">Pagos del mes por método</div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byMethod} dataKey="value" nameKey="name" label outerRadius={110}>
                  {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length] ?? primary} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color }}>{value}</div>
    </Card>
  );
}
