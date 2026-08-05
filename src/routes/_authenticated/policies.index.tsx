import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/policies/")({
  head: () => ({ meta: [{ title: "Certificados — ZEMGO" }] }),
  component: PoliciesList,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_payment: "outline",
  active: "default",
  expired: "secondary",
  cancelled: "destructive",
  suspended: "destructive",
};

function PoliciesList() {
  const { activeProgram, programs } = useProgram();
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [validityFilter, setValidityFilter] = useState<string>("all");

  const effectiveProgramId =
    programFilter === "active" ? activeProgram?.id : programFilter === "all" ? null : programFilter;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["policies", effectiveProgramId, statusFilter, validityFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("policies")
        .select(
          "id, folio, status, start_date, end_date, premium, programs(id,name,color_primary), clients(id,first_name,last_name)",
        )
        // Corporate certificates are managed inside the company folder.
        .is("company_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (effectiveProgramId) q = q.eq("program_id", effectiveProgramId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const today = new Date().toISOString().slice(0, 10);
      if (validityFilter === "vigente") q = q.gte("end_date", today).lte("start_date", today);
      if (validityFilter === "vencida") q = q.lt("end_date", today);
      const { data, error } = await q;
      if (error) throw error;
      const term = search.trim().toLowerCase();
      return (data ?? []).filter((r: any) => {
        if (!term) return true;
        const name = `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.toLowerCase();
        return r.folio.toLowerCase().includes(term) || name.includes(term);
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Certificados</h1>
          <p className="text-sm text-muted-foreground">Gestión centralizada por programa.</p>
        </div>
        <Button asChild>
          <Link to="/policies/new">
            <Plus className="h-4 w-4 mr-2" /> Nuevo certificado
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px] space-y-1">
            <label className="text-xs text-muted-foreground">Buscar (folio o titular)</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ej: ABC-2026-00001 o García"
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
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Vigencia</label>
            <Select value={validityFilter} onValueChange={setValidityFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="vigente">Vigente hoy</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Titular</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Prima</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin certificados registrados.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.folio}</TableCell>
                <TableCell className="font-medium">{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.programs?.color_primary }} />
                    {r.programs?.name}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {r.start_date ? new Date(r.start_date).toLocaleDateString("es-MX") : "—"} →{" "}
                  {r.end_date ? new Date(r.end_date).toLocaleDateString("es-MX") : "—"}
                </TableCell>
                <TableCell>{r.premium ? `$${Number(r.premium).toLocaleString("es-MX")}` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/policies/$policyId" params={{ policyId: r.id }}>
                      <FileText className="h-4 w-4 mr-1" /> Ver
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
