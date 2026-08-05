import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Plus, Users, FileText, ArrowRight, Search } from "lucide-react";
import { listCompanies } from "@/lib/companies.functions";
import { useProgram } from "@/lib/program-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/companies/")({
  head: () => ({
    meta: [
      { title: "Empresas — ZEMGO" },
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
  const [scope, setScope] = useState<"active" | "all">("all");
  const [search, setSearch] = useState("");
  const programId = scope === "active" ? (activeProgram?.id ?? null) : null;

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
            Empresas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada empresa agrupa a todos sus asegurados: un certificado por persona, consolidado en una sola carpeta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={scope === "all" ? "default" : "outline"} size="sm" onClick={() => setScope("all")}>
            Todos los programas
          </Button>
          <Button variant={scope === "active" ? "default" : "outline"} size="sm" onClick={() => setScope("active")}>
            {activeProgram?.name ?? "Programa activo"}
          </Button>
          <Button asChild size="sm">
            <Link to="/clients/new">
              <Plus className="h-4 w-4 mr-1" /> Nueva empresa
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar por razón social o RFC…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-3">
        {q.isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-md bg-muted/40 animate-pulse" />)
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Aún no hay empresas registradas. Usa “Nueva empresa” y elige la opción Empresa.
            </CardContent>
          </Card>
        ) : (
          rows.map((c: any) => (
            <Link key={c.id} to="/companies/$companyId" params={{ companyId: c.id }} className="block">
              <Card className="hover:border-primary/60 transition">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
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
                      {c.rfc && <Badge variant="outline" className="font-mono text-[10px]">{c.rfc}</Badge>}
                      {!c.is_active && <Badge variant="secondary">inactiva</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {c.stats?.employees ?? 0} asegurados
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> {c.stats?.policies ?? 0} certificados ({c.stats?.active ?? 0} activos)
                      </span>
                      {c.contact_name && <span>Contacto: {c.contact_name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Prima total</div>
                    <div className="font-semibold tabular-nums">{fmtMx(c.stats?.premium ?? 0)}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
