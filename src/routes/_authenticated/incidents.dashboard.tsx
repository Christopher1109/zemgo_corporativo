import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { INCIDENT_STATUS } from "./incidents.index";

export const Route = createFileRoute("/_authenticated/incidents/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard de siniestros — HOPE Consulting" }] }),
  component: IncidentsDashboard,
});

function IncidentsDashboard() {
  const { activeProgram, programs } = useProgram();

  const { data: all = [] } = useQuery({
    queryKey: ["incidents-dash", activeProgram?.id],
    queryFn: async () => {
      let q = supabase
        .from("incidents")
        .select("id, status, reported_at, approved_at, hospital, policies!inner(program_id, status)")
        .order("reported_at", { ascending: false })
        .limit(2000);
      if (activeProgram?.id) q = q.eq("policies.program_id", activeProgram.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const { data: passes = [] } = useQuery({
    queryKey: ["passes-dash", activeProgram?.id],
    queryFn: async () => {
      let q = supabase
        .from("medical_passes")
        .select("id, valid_until, revoked_at, policies!inner(program_id)")
        .limit(2000);
      if (activeProgram?.id) q = q.eq("policies.program_id", activeProgram.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const { data: activePoliciesCount = 0 } = useQuery({
    queryKey: ["active-policies-count", activeProgram?.id],
    queryFn: async () => {
      let q = supabase.from("policies").select("id", { count: "exact", head: true }).eq("status", "active");
      if (activeProgram?.id) q = q.eq("program_id", activeProgram.id);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const monthIncidents = all.filter((i: any) => new Date(i.reported_at) >= startMonth);
  const issuedThisMonth = monthIncidents.filter((i: any) => i.status === "pass_issued" || i.status === "pass_expired");
  const rejectedThisMonth = monthIncidents.filter((i: any) => i.status === "rejected");
  const activePassesNow = passes.filter((p: any) => !p.revoked_at && new Date(p.valid_until).getTime() > Date.now()).length;
  const ratio = issuedThisMonth.length + rejectedThisMonth.length > 0
    ? Math.round((issuedThisMonth.length / (issuedThisMonth.length + rejectedThisMonth.length)) * 100)
    : 0;
  const avgHours = (() => {
    const approved = monthIncidents.filter((i: any) => i.approved_at);
    if (approved.length === 0) return null;
    const sum = approved.reduce((s, i: any) => s + (new Date(i.approved_at).getTime() - new Date(i.reported_at).getTime()), 0);
    return Math.round(sum / approved.length / 3600000);
  })();
  const siniestralidad = activePoliciesCount > 0 ? ((monthIncidents.length / activePoliciesCount) * 100).toFixed(1) : "0";

  // Monthly series (12 months)
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("es-MX", { month: "short" }), count: 0 });
  }
  all.forEach((i: any) => {
    const d = new Date(i.reported_at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.find((x) => x.key === k);
    if (m) m.count++;
  });

  // Status distribution this month
  const statusDist = Object.keys(INCIDENT_STATUS).map((s) => ({
    name: INCIDENT_STATUS[s].label,
    value: monthIncidents.filter((i: any) => i.status === s).length,
  })).filter((x) => x.value > 0);

  const COLORS = ["#fbbf24", "#fb923c", "#22c55e", "#9ca3af", "#3b82f6", "#374151", "#ef4444"];

  // Top hospitals
  const hospitalMap = new Map<string, number>();
  all.forEach((i: any) => { if (i.hospital) hospitalMap.set(i.hospital, (hospitalMap.get(i.hospital) ?? 0) + 1); });
  const topHospitals = [...hospitalMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  void programs;
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Button asChild variant="ghost" size="sm"><Link to="/incidents"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
      <h1 className="text-2xl font-bold">Dashboard de Siniestros{activeProgram ? ` · ${activeProgram.code}` : ""}</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Reportados este mes" value={monthIncidents.length} />
        <Kpi label="Pases activos ahora" value={activePassesNow} />
        <Kpi label="Emitidos / Rechazados" value={`${issuedThisMonth.length} / ${rejectedThisMonth.length}`} hint={`${ratio}% aprobación`} />
        <Kpi label="Tiempo prom. emisión" value={avgHours == null ? "—" : `${avgHours} hrs`} />
        <Kpi label="Siniestralidad" value={`${siniestralidad}%`} hint={`${monthIncidents.length} / ${activePoliciesCount} activas`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Siniestros últimos 12 meses</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={months}>
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Siniestros" fill={activeProgram?.color_primary ?? "#6366f1"} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Distribución por estado (mes actual)</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusDist} dataKey="value" nameKey="name" outerRadius={80} label>
                  {statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Top 10 hospitales</h2>
        <Table>
          <TableHeader><TableRow><TableHead>Hospital</TableHead><TableHead className="text-right">Siniestros</TableHead></TableRow></TableHeader>
          <TableBody>
            {topHospitals.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">Sin datos.</TableCell></TableRow>}
            {topHospitals.map(([h, n]) => (
              <TableRow key={h}><TableCell>{h}</TableCell><TableCell className="text-right">{n}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}
