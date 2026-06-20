import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, AlertTriangle, BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProgram } from "@/lib/program-context";
import { getMedicalPassSignedUrl } from "@/lib/incidents.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/incidents/")({
  head: () => ({ meta: [{ title: "Siniestros — HOPE Consulting" }] }),
  component: IncidentsList,
});

export const INCIDENT_STATUS: Record<string, { label: string; cls: string }> = {
  reported: { label: "Reportado", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  pending_review: { label: "En revisión", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  pass_issued: { label: "Pase emitido", cls: "bg-green-100 text-green-800 border-green-300" },
  pass_expired: { label: "Pase expirado", cls: "bg-gray-100 text-gray-700 border-gray-300" },
  in_treatment: { label: "En tratamiento", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  closed: { label: "Cerrado", cls: "bg-gray-200 text-gray-900 border-gray-400" },
  rejected: { label: "Rechazado", cls: "bg-red-100 text-red-800 border-red-300" },
};

const PRIORITY = new Set(["reported", "pending_review"]);

function IncidentsList() {
  const { activeProgram } = useProgram();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["incidents", activeProgram?.id, status, search, from, to],
    queryFn: async () => {
      let q = supabase
        .from("incidents")
        .select("id, status, reported_at, occurred_at, accident_date, hospital, description, policies!inner(folio, program_id, programs(code, name, color_primary)), clients!inner(first_name, last_name, curp), medical_passes(id, pdf_url, revoked_at, valid_until)")
        .order("reported_at", { ascending: false })
        .limit(500);
      if (activeProgram?.id) q = q.eq("policies.program_id", activeProgram.id);
      if (status !== "all") q = q.eq("status", status as any);
      if (from) q = q.gte("accident_date", from);
      if (to) q = q.lte("accident_date", to);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (search.trim()) {
        const s = search.toLowerCase();
        rows = rows.filter((i: any) => {
          const c = i.clients;
          const full = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.toLowerCase();
          return (i.policies?.folio ?? "").toLowerCase().includes(s) ||
                 (c?.curp ?? "").toLowerCase().includes(s) || full.includes(s);
        });
      }
      // Priority sort: reported/pending_review first
      rows.sort((a, b) => {
        const ap = PRIORITY.has(a.status) ? 0 : 1;
        const bp = PRIORITY.has(b.status) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
      });
      return rows;
    },
  });

  const pages = Math.max(1, Math.ceil(incidents.length / pageSize));
  const slice = useMemo(
    () => incidents.slice(page * pageSize, (page + 1) * pageSize),
    [incidents, page],
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" /> Siniestros
          </h1>
          <p className="text-sm text-muted-foreground">Gestión de reportes y pases médicos</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/incidents/dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard</Link>
          </Button>
          <Button asChild>
            <Link to="/incidents/new"><Plus className="h-4 w-4 mr-1" />Reportar siniestro</Link>
          </Button>
        </div>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <Input placeholder="Folio, CURP o nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(INCIDENT_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Desde" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Hasta" />
        <Button variant="ghost" onClick={() => { setStatus("all"); setSearch(""); setFrom(""); setTo(""); }}>
          Limpiar
        </Button>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Fecha accidente</TableHead>
              <TableHead>Hospital</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Días</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando…</TableCell></TableRow>}
            {!isLoading && slice.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin siniestros.</TableCell></TableRow>
            )}
            {slice.map((i: any) => {
              const days = Math.floor((Date.now() - new Date(i.reported_at).getTime()) / 86400000);
              const st = INCIDENT_STATUS[i.status] ?? { label: i.status, cls: "" };
              const prog = i.policies?.programs;
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.clients?.first_name} {i.clients?.last_name}</div>
                    <div className="text-xs text-muted-foreground">{i.clients?.curp}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{i.policies?.folio}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: prog?.color_primary }} />
                      {prog?.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{i.accident_date ?? new Date(i.occurred_at).toLocaleDateString("es-MX")}</TableCell>
                  <TableCell className="text-sm max-w-[160px] truncate">{i.hospital ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge className={st.cls} variant="outline">{st.label}</Badge>
                      {PRIORITY.has(i.status) && <Badge variant="destructive" className="text-[10px]">Prioridad</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{days}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/incidents/$incidentId" params={{ incidentId: i.id }}>Abrir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t">
            <div className="text-xs text-muted-foreground">Página {page + 1} de {pages}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
