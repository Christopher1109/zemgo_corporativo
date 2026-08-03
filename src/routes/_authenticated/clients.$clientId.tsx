import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Detalle de cliente — ZEMGO" },
      { name: "description", content: "Expediente completo del cliente: datos personales, programas, vendedor y certificados." },
    ],
  }),
  component: ClientDetail,
});

const CP_STATUS: Record<string, { label: string; cls: string }> = {
  prospect: { label: "Prospecto", cls: "bg-amber-100 text-amber-800" },
  active: { label: "Activo", cls: "bg-green-100 text-green-800" },
  inactive: { label: "Inactivo", cls: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelado", cls: "bg-red-100 text-red-800" },
};

const POLICY_STATUS: Record<string, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

function ClientDetail() {
  const { clientId } = Route.useParams();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, sales_reps(id, full_name, code)")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["client-programs", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_programs")
        .select("id, status, enrolled_at, cancelled_at, programs(id, code, name, color_primary)")
        .eq("client_id", clientId)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["client-policies", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policies")
        .select("id, folio, policy_number, certificate_number, status, start_date, end_date, premium, programs(code, name)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["client-incidents", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, status, accident_date, hospital, reported_at")
        .eq("client_id", clientId)
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (isLoading || !client) {
    return <div className="p-6 text-center text-muted-foreground">Cargando…</div>;
  }

  const address =
    client.address_full ??
    [client.street, client.number, client.colonia, client.city, client.state, client.zip]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" />Volver a clientes</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            {client.first_name} {client.last_name}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{client.curp ?? "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enrollments.map((e) => {
            const st = CP_STATUS[e.status] ?? { label: e.status, cls: "" };
            return (
              <Badge key={e.id} variant="outline" className={st.cls}>
                {e.programs?.code}: {st.label}
              </Badge>
            );
          })}
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Datos personales</TabsTrigger>
          <TabsTrigger value="programs">Programas ({enrollments.length})</TabsTrigger>
          <TabsTrigger value="policies">Certificados ({policies.length})</TabsTrigger>
          <TabsTrigger value="incidents">Siniestros ({incidents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="p-4 grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Nombre completo" value={`${client.first_name} ${client.last_name ?? ""}`} />
            <Field label="CURP" value={client.curp ?? "—"} />
            <Field label="RFC" value={client.rfc ?? "—"} />
            <Field label="Fecha de nacimiento" value={client.date_of_birth ?? "—"} />
            <Field label="Género" value={client.gender ?? "—"} />
            <Field label="Estado civil" value={client.marital_status ?? "—"} />
            <Field label="Teléfono" value={client.phone ?? "—"} />
            <Field label="Teléfono alterno" value={client.phone_alt ?? "—"} />
            <Field label="Email" value={client.email ?? "—"} />
            <Field label="Vendedor asignado" value={client.sales_reps?.full_name ?? "—"} />
            <Field label="Alta en sistema" value={new Date(client.created_at).toLocaleString("es-MX")} />
            <Field label="Última actualización" value={new Date(client.updated_at).toLocaleString("es-MX")} />
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Domicilio</div>
              <div>{address || "—"}</div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="programs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Programa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Inscrito</TableHead>
                  <TableHead>Cancelado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin programas.</TableCell></TableRow>
                )}
                {enrollments.map((e) => {
                  const st = CP_STATUS[e.status] ?? { label: e.status, cls: "" };
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.programs?.color_primary }} />
                          {e.programs?.name}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                      <TableCell>{new Date(e.enrolled_at).toLocaleDateString("es-MX")}</TableCell>
                      <TableCell>{e.cancelled_at ? new Date(e.cancelled_at).toLocaleDateString("es-MX") : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Programa</TableHead>
                  <TableHead>No. póliza</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Este cliente todavía no tiene certificado emitido (prospecto).
                  </TableCell></TableRow>
                )}
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.folio}</TableCell>
                    <TableCell>{p.programs?.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.policy_number ?? "—"}</TableCell>
                    <TableCell>{p.start_date ?? "—"} → {p.end_date ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{POLICY_STATUS[p.status] ?? p.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/policies/$policyId" params={{ policyId: p.id }}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="incidents">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha accidente</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin siniestros.</TableCell></TableRow>
                )}
                {incidents.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.accident_date ?? "—"}</TableCell>
                    <TableCell>{i.hospital ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{i.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/incidents/$incidentId" params={{ incidentId: i.id }}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
