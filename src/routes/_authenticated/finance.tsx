import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({ meta: [{ title: "Finanzas — ZEMGO" }] }),
  component: FinancePage,
});

function FinancePage() {
  const { activeProgram, programs } = useProgram();
  const [scope, setScope] = useState<"active" | "all">("active");
  const programId = scope === "active" ? activeProgram?.id : null;

  const { data: payments = [] } = useQuery({
    queryKey: ["finance-payments", programId],
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
    let collected = 0, pending = 0, overdue = 0, paidThisMonth = 0, paidCount = 0, failedCount = 0, paidOnlyThisMonth = 0, overdueThisMonth = 0, upcoming30 = 0;
    const horizon30 = new Date(now.getTime() + 30 * 86400000);
    for (const p of payments) {
      const amt = Number(p.paid_amount ?? p.amount);
      if (p.status === "paid" && p.paid_at && new Date(p.paid_at) >= monthStart) {
        paidThisMonth += amt; paidCount++; paidOnlyThisMonth += amt;
      }
      if (p.status === "pending" || p.status === "overdue") pending += Number(p.amount);
      if (p.status === "overdue") { overdue += Number(p.amount); overdueThisMonth += Number(p.amount); }
      if (p.status === "failed") failedCount++;
      if (p.status === "paid") collected += amt;
      if (p.status === "pending" && p.due_date && new Date(p.due_date) <= horizon30 && new Date(p.due_date) >= now) {
        upcoming30 += Number(p.amount);
      }
    }
    const rate = (paidOnlyThisMonth + overdueThisMonth) > 0
      ? (paidOnlyThisMonth / (paidOnlyThisMonth + overdueThisMonth)) * 100
      : 0;
    return { collected: paidThisMonth, pending, overdue, rate, paidCount, failedCount, upcoming30 };
  }, [payments, monthStart]);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            Finanzas
          </h1>
          <p className="text-sm text-muted-foreground">Cobranza, deudores, métodos y estimaciones del periodo.</p>
        </div>
        <Select value={scope} onValueChange={(v) => setScope(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{activeProgram?.name}</SelectItem>
            <SelectItem value="all">Todos los programas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Cobrado este mes" value={fmt(kpis.collected)} color={primary} />
        <KPI label="Pendiente de cobro" value={fmt(kpis.pending)} />
        <KPI label="Vencido" value={fmt(kpis.overdue)} color="#dc2626" />
        <KPI label="Próximos 30 días" value={fmt(kpis.upcoming30)} color="#ea580c" />
        <KPI label="Tasa de cobranza" value={`${kpis.rate.toFixed(1)}%`} color={primary} />
        <KPI label="Exitosos / fallidos" value={`${kpis.paidCount} / ${kpis.failedCount}`} />
      </div>

      <Card className="p-4">
        <div className="font-medium mb-3">Cobranza mensual (últimos 12 meses)</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {programs.map((p) => (
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
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={140} fontSize={11} />
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

function fmt(n: number) { return `$${(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`; }

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color }}>{value}</div>
    </Card>
  );
}
