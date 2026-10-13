import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Plus, Users, FileText, ArrowRight, Search, Pencil, Trash2 } from "lucide-react";
import { listCompanies } from "@/lib/companies.functions";
import { useProgram, useActiveProgramId } from "@/lib/program-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditCompanyDialog, DeleteCompanyDialog, CreateCompanyDialog } from "@/components/companies/company-dialogs";
import { groupLabels, GROUP_TYPE_LABEL, BILLING_MODE_LABEL } from "@/lib/group-labels";

export const Route = createFileRoute("/_authenticated/companies/")({
  head: () => ({
    meta: [
      { title: "Empresas y grupos — ZEMGO" },
      { name: "description", content: "Empresas dadas de alta y sus asegurados consolidados." },
    ],
  }),
  component: CompaniesPage,
});

function fmtMx(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function CompaniesPage() {
  const { activeProgram } = useProgram();
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const programId = useActiveProgramId();
  const [createOpen, setCreateOpen] = useState(false);
  const L = groupLabels(activeProgram?.code);

  const fn = useServerFn(listCompanies);
  const q = useQuery({
    queryKey: ["companies", programId],
    queryFn: () => fn({ data: { program_id: programId } }),
  });

  const term = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter(
    (c: any) =>
      !term ||
      c.legal_name.toLowerCase().includes(term) ||
      (c.rfc ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" style={{ color: "var(--program-primary)" }} />
            {L.plural}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{L.description}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {L.newLabel}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder={L.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-3">
        {q.isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-md bg-muted/40 animate-pulse" />)
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {L.empty}
            </CardContent>
          </Card>
        ) : (
          rows.map((c: any) => (
            <Card key={c.id} className="hover:border-primary/60 transition">
              <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                <Link to="/companies/$companyId" params={{ companyId: c.id }} className="block min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{c.legal_name}</span>
                      {c.programs && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                          style={{ borderColor: c.programs.color_primary, color: c.programs.color_primary }}
                        >
                          {c.programs.code}
                        </Badge>
                      )}
                      {L.fut && c.group_type && (
                        <Badge variant="secondary" className="text-[10px]">{GROUP_TYPE_LABEL[c.group_type as keyof typeof GROUP_TYPE_LABEL] ?? c.group_type}</Badge>
                      )}
                      {L.fut && c.billing_mode && (
                        <Badge variant="outline" className="text-[10px]">{BILLING_MODE_LABEL[c.billing_mode] ?? c.billing_mode}</Badge>
                      )}
                      {!L.fut && c.rfc && <Badge variant="outline" className="font-mono text-[10px]">{c.rfc}</Badge>}
                      {!c.is_active && <Badge variant="secondary">inactiva</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {c.stats?.employees ?? 0} asegurados activos
                        {(c.stats?.cancelledEmployees ?? 0) > 0 && ` · ${c.stats.cancelledEmployees} bajas`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> {c.stats?.active ?? 0} certificados activos
                        {(c.stats?.policies ?? 0) - (c.stats?.active ?? 0) > 0 && ` · ${(c.stats?.policies ?? 0) - (c.stats?.active ?? 0)} cancelados`}
                      </span>
                      {c.contact_name && <span>{L.fut ? "Encargado" : "Contacto"}: {c.contact_name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Precio total (activos)</div>
                    <div className="font-semibold tabular-nums">{fmtMx(c.stats?.premium ?? 0)}</div>
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={`Editar ${L.singularLower}`}
                    onClick={() => setEditTarget(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={`Eliminar ${L.singularLower}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <CreateCompanyDialog programId={programId} programCode={activeProgram?.code} open={createOpen} onOpenChange={setCreateOpen} />
      {editTarget && (
        <EditCompanyDialog company={editTarget} open onOpenChange={(v) => !v && setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteCompanyDialog
          company={deleteTarget}
          open
          onOpenChange={(v) => !v && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
