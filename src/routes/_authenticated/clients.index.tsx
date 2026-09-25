import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CertificateBadge } from "@/components/certificates/CertificateBadge";
import { downloadClientDataSheet } from "@/lib/client-data-sheet";
import { ClientDataUploadDialog } from "@/components/clients/ClientDataUploadDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clientes — ZEMGO" }] }),
  component: ClientsList,
});

function ClientsList() {
  const { activeProgram, programs } = useProgram();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const effectiveProgramId =
    programFilter === "active" ? activeProgram?.id : programFilter === "all" ? null : programFilter;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clients", effectiveProgramId, statusFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("client_programs")
        .select(
          "status, enrolled_at, programs(id,code,name,color_primary), clients(id,first_name,last_name,curp,phone,email,created_at,company_id,policies(certificate_number,program_id))",
        )
        .order("enrolled_at", { ascending: false })
        .limit(200);
      if (effectiveProgramId) q = q.eq("program_id", effectiveProgramId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      const term = search.trim().toLowerCase();
      return (data ?? []).filter((r: any) => {
        // Corporate insureds live inside their company folder, not in this list.
        if (r.clients?.company_id) return false;
        if (!term) return true;
        const c = r.clients;
        return (
          `${c?.first_name} ${c?.last_name}`.toLowerCase().includes(term) ||
          (c?.curp ?? "").toLowerCase().includes(term)
        );
      });
    },
  });

  const [downloading, setDownloading] = useState(false);
  async function downloadMissing() {
    if (!activeProgram) return toast.error("Selecciona un programa.");
    setDownloading(true);
    try {
      await downloadClientDataSheet(activeProgram as any);
    } catch (e: any) { toast.error(e.message ?? "No se pudo generar el archivo"); }
    finally { setDownloading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Clientes individuales y sus afiliaciones. Los asegurados de empresas se consolidan en <Link to="/companies" className="underline">Empresas</Link>.</p>
        </div>
        <div className="flex gap-2">
        <Button variant="outline" onClick={downloadMissing} disabled={downloading}>
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Descargar datos de clientes
        </Button>
        <Button asChild>
          <Link to="/clients/new">
            <Plus className="h-4 w-4 mr-2" /> Nuevo cliente
          </Link>
        </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px] space-y-1">
            <label className="text-xs text-muted-foreground">Buscar (nombre o CURP)</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ej: García o GARC900101..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Programa</label>
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Programa activo</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="prospect">Prospecto</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>CURP</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin clientes registrados.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow
                key={`${r.clients?.id}-${r.programs?.id}`}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate({ to: "/clients/$clientId", params: { clientId: r.clients.id } })}
              >
                <TableCell className="font-medium">{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                <TableCell className="font-mono text-xs">{r.clients?.curp}</TableCell>
                <TableCell>{r.clients?.phone ?? "—"}</TableCell>
                <TableCell>{r.clients?.email ?? "—"}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.programs?.color_primary }} />
                    {r.programs?.name}
                  </span>
                </TableCell>
                <TableCell>
                  {(() => {
                    const ps = (r.clients?.policies ?? []).filter((p: any) => p.program_id === r.programs?.id);
                    if (ps.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                    return <div className="flex flex-wrap gap-1">{ps.map((p: any, i: number) => <CertificateBadge key={i} number={p.certificate_number} />)}</div>;
                  })()}
                </TableCell>
                <TableCell>{new Date(r.enrolled_at).toLocaleDateString("es-MX")}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
