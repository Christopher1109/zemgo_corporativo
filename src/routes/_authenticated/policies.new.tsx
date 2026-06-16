import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";
import { createPolicy } from "@/lib/policies.functions";

export const Route = createFileRoute("/_authenticated/policies/new")({
  head: () => ({ meta: [{ title: "Nueva póliza — HOPE Consulting" }] }),
  component: NewPolicy,
});

type Beneficiary = { full_name: string; relationship: string; percentage: number };
type Dependent = { full_name: string; relationship: string; date_of_birth: string };

function NewPolicy() {
  const { activeProgram, programs } = useProgram();
  const navigate = useNavigate();
  const createFn = useServerFn(createPolicy);

  const [programId, setProgramId] = useState<string>(activeProgram?.id ?? "");
  useEffect(() => {
    if (!programId && activeProgram?.id) setProgramId(activeProgram.id);
  }, [activeProgram?.id, programId]);

  const selectedProgram = programs.find((p) => p.id === programId);
  const isABC = selectedProgram?.code?.toUpperCase() === "ABC";

  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [clientLabel, setClientLabel] = useState<string>("");

  const { data: clientResults = [] } = useQuery({
    queryKey: ["client-search", clientSearch, programId],
    queryFn: async () => {
      const term = clientSearch.trim();
      if (term.length < 2) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, curp")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,curp.ilike.%${term}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: clientSearch.length >= 2,
  });

  const { data: coverages = [] } = useQuery({
    queryKey: ["coverages", programId],
    queryFn: async () => {
      if (!programId) return [];
      const { data, error } = await supabase
        .from("program_coverages")
        .select("code, description, sum_insured, note, is_included, display_order")
        .eq("program_id", programId)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!programId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const oneYearFromToday = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [form, setForm] = useState({
    policy_number: "",
    certificate_number: "",
    issue_date: today,
    start_date: today,
    end_date: oneYearFromToday,
    contracting_party: "",
    premium: "",
    sum_insured: "",
  });

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([
    { full_name: "", relationship: "", percentage: 100 },
  ]);
  const [dependents, setDependents] = useState<Dependent[]>([]);

  const sumPct = beneficiaries.reduce((s, b) => s + (Number(b.percentage) || 0), 0);

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          client_id: clientId,
          program_id: programId,
          policy_number: form.policy_number || null,
          certificate_number: form.certificate_number || null,
          issue_date: form.issue_date,
          start_date: form.start_date,
          end_date: form.end_date,
          contracting_party: form.contracting_party || null,
          premium: form.premium ? Number(form.premium) : null,
          sum_insured: form.sum_insured ? Number(form.sum_insured) : null,
          beneficiaries: beneficiaries.map((b) => ({
            full_name: b.full_name,
            relationship: b.relationship,
            percentage: Number(b.percentage),
          })),
          dependents: isABC
            ? dependents.map((d) => ({
                full_name: d.full_name,
                relationship: d.relationship,
                date_of_birth: d.date_of_birth || null,
              }))
            : [],
        },
      }),
    onSuccess: (res) => {
      toast.success(`Póliza creada: ${res.folio}`);
      navigate({ to: "/policies/$policyId", params: { policyId: res.id } });
    },
    onError: (err: any) => toast.error(err?.message ?? "Error al crear póliza"),
  });

  const canSubmit =
    !!clientId &&
    !!programId &&
    form.start_date &&
    form.end_date &&
    beneficiaries.every((b) => b.full_name && b.relationship && b.percentage > 0) &&
    Math.round(sumPct) === 100;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/policies" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <h1 className="text-2xl font-semibold">Nueva póliza</h1>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Programa</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">El folio se generará automáticamente.</p>
          </div>

          <div>
            <Label>Cliente titular</Label>
            <Input
              placeholder="Buscar por nombre o CURP (mín. 2 caracteres)…"
              value={clientId ? clientLabel : clientSearch}
              onChange={(e) => {
                setClientId("");
                setClientLabel("");
                setClientSearch(e.target.value);
              }}
            />
            {!clientId && clientResults.length > 0 && (
              <div className="border rounded-md mt-1 max-h-48 overflow-auto bg-popover">
                {clientResults.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => {
                      setClientId(c.id);
                      setClientLabel(`${c.first_name} ${c.last_name} — ${c.curp}`);
                      setClientSearch("");
                    }}
                  >
                    <div className="font-medium">{c.first_name} {c.last_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.curp}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>No. Póliza HIR</Label>
            <Input value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} />
          </div>
          <div>
            <Label>No. Certificado</Label>
            <Input value={form.certificate_number} onChange={(e) => setForm({ ...form, certificate_number: e.target.value })} />
          </div>
          <div>
            <Label>Fecha de emisión</Label>
            <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
          </div>
          <div>
            <Label>Contratante</Label>
            <Input value={form.contracting_party} onChange={(e) => setForm({ ...form, contracting_party: e.target.value })} />
          </div>
          <div>
            <Label>Vigencia desde</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <Label>Vigencia hasta</Label>
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div>
            <Label>Prima (MXN)</Label>
            <Input type="number" step="0.01" value={form.premium} onChange={(e) => setForm({ ...form, premium: e.target.value })} />
          </div>
          <div>
            <Label>Suma asegurada (MXN)</Label>
            <Input type="number" step="0.01" value={form.sum_insured} onChange={(e) => setForm({ ...form, sum_insured: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Beneficiarios <span className="text-sm font-normal text-muted-foreground">(1 a 2, suma = 100%)</span></h2>
          {beneficiaries.length < 2 && (
            <Button size="sm" variant="outline" onClick={() => setBeneficiaries([...beneficiaries, { full_name: "", relationship: "", percentage: 0 }])}>
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
          )}
        </div>
        {beneficiaries.map((b, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_180px_120px_auto] gap-2 items-end">
            <div>
              <Label>Nombre</Label>
              <Input value={b.full_name} onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))} />
            </div>
            <div>
              <Label>Parentesco</Label>
              <Input value={b.relationship} onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} />
            </div>
            <div>
              <Label>%</Label>
              <Input type="number" min={0} max={100} value={b.percentage} onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => j === i ? { ...x, percentage: Number(e.target.value) } : x))} />
            </div>
            {beneficiaries.length > 1 && (
              <Button size="icon" variant="ghost" onClick={() => setBeneficiaries(beneficiaries.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className={`text-sm ${Math.round(sumPct) === 100 ? "text-emerald-600" : "text-destructive"}`}>
          Suma actual: {sumPct}% {Math.round(sumPct) !== 100 && "(debe ser 100%)"}
        </div>
      </Card>

      {isABC && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Dependientes <span className="text-sm font-normal text-muted-foreground">(solo ABC)</span></h2>
            <Button size="sm" variant="outline" onClick={() => setDependents([...dependents, { full_name: "", relationship: "", date_of_birth: "" }])}>
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
          </div>
          {dependents.length === 0 && <p className="text-sm text-muted-foreground">Sin dependientes registrados.</p>}
          {dependents.map((d, i) => (
            <div key={i} className="grid md:grid-cols-[1fr_180px_180px_auto] gap-2 items-end">
              <div>
                <Label>Nombre</Label>
                <Input value={d.full_name} onChange={(e) => setDependents(dependents.map((x, j) => j === i ? { ...x, full_name: e.target.value } : x))} />
              </div>
              <div>
                <Label>Parentesco</Label>
                <Select value={d.relationship} onValueChange={(v) => setDependents(dependents.map((x, j) => j === i ? { ...x, relationship: v } : x))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cónyuge">Cónyuge</SelectItem>
                    <SelectItem value="hijo">Hijo</SelectItem>
                    <SelectItem value="hija">Hija</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha de nacimiento</Label>
                <Input type="date" value={d.date_of_birth} onChange={(e) => setDependents(dependents.map((x, j) => j === i ? { ...x, date_of_birth: e.target.value } : x))} />
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDependents(dependents.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Coberturas del programa <span className="text-sm font-normal text-muted-foreground">(solo lectura)</span></h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Suma asegurada</TableHead>
              <TableHead>Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coverages.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-muted-foreground text-sm">Sin coberturas definidas para este programa.</TableCell></TableRow>
            )}
            {coverages.map((c: any) => (
              <TableRow key={c.code}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell>{c.sum_insured ? `$${Number(c.sum_insured).toLocaleString("es-MX")}` : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.note ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/policies" })}>Cancelar</Button>
        <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Creando…" : "Crear póliza"}
        </Button>
      </div>
    </div>
  );
}
