import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, CreditCard, AlertTriangle } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — HOPE Consulting" }] }),
  component: Dashboard,
});

function Metric({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4" style={{ color: "var(--program-primary)" }} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { activeProgram } = useProgram();
  const programId = activeProgram?.id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard", programId],
    enabled: !!programId,
    queryFn: async () => {
      const [clients, policies, payments, incidents] = await Promise.all([
        supabase.from("client_programs").select("id", { count: "exact", head: true }).eq("program_id", programId!).eq("status", "active"),
        supabase.from("policies").select("id", { count: "exact", head: true }).eq("program_id", programId!).eq("status", "active"),
        supabase.from("payments").select("amount").gte("paid_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from("incidents").select("id", { count: "exact", head: true }).in("status", ["reported", "pending_review", "in_treatment"]),
      ]);
      const monthTotal = (payments.data ?? []).reduce((s, p: any) => s + Number(p.amount ?? 0), 0);
      return {
        clients: clients.count ?? 0,
        policies: policies.count ?? 0,
        payments: monthTotal,
        incidents: incidents.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen del programa <strong>{activeProgram?.name}</strong>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label="Clientes activos" value={stats?.clients ?? 0} />
        <Metric icon={FileText} label="Pólizas vigentes" value={stats?.policies ?? 0} />
        <Metric icon={CreditCard} label="Pagos del mes" value={`$${(stats?.payments ?? 0).toLocaleString("es-MX")}`} hint="MXN" />
        <Metric icon={AlertTriangle} label="Siniestros abiertos" value={stats?.incidents ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bienvenido</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Esta es la fase inicial de la plataforma. Las secciones de Dashboard y Clientes están operativas.</p>
          <p>Cambia de programa con el selector del sidebar para ver cómo la interfaz se adapta a los colores corporativos de cada uno.</p>
        </CardContent>
      </Card>
    </div>
  );
}
