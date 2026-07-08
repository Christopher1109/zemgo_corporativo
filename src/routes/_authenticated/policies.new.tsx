import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, X, User, Check, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";
import { createPolicy } from "@/lib/policies.functions";
import {
  searchContractors, createContractor, createContractorFromClient,
} from "@/lib/contractors.functions";

export const Route = createFileRoute("/_authenticated/policies/new")({
  head: () => ({ meta: [{ title: "Nuevo certificado — ZEMGO" }] }),
  component: NewPolicy,
});

type Beneficiary = { full_name: string; relationship: string; percentage: number };
type Dependent = { full_name: string; relationship: string; date_of_birth: string };
type ContractorRow = {
  id: string; full_name: string; curp?: string | null;
  phone?: string | null; email?: string | null;
  city?: string | null; state?: string | null;
};

function emptyContractorForm() {
  return {
    full_name: "", curp: "", email: "", phone: "",
    street: "", number: "", colonia: "", city: "", state: "", zip: "",
  };
}

function NewPolicy() {
  const { activeProgram, programs } = useProgram();
  const navigate = useNavigate();
  const createFn = useServerFn(createPolicy);
  const searchContractorFn = useServerFn(searchContractors);
  const createContractorFn = useServerFn(createContractor);
  const fromClientFn = useServerFn(createContractorFromClient);

  const [programId, setProgramId] = useState<string>(activeProgram?.id ?? "");
  useEffect(() => {
    if (!programId && activeProgram?.id) setProgramId(activeProgram.id);
  }, [activeProgram?.id, programId]);

  const selectedProgram = programs.find((p) => p.id === programId);
  const isABC = selectedProgram?.code?.toUpperCase() === "ABC";

  // -------- CLIENTE TITULAR --------
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

  // -------- CONTRATANTE --------
  const [contractorSame, setContractorSame] = useState(true);
  const [contractor, setContractor] = useState<ContractorRow | null>(null);
  const [contractorSearch, setContractorSearch] = useState("");
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorForm, setCreatorForm] = useState(emptyContractorForm());
  const [creatorSaving, setCreatorSaving] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<null | ContractorRow>(null);

  const { data: contractorResults = [] } = useQuery({
    queryKey: ["contractor-search", contractorSearch],
    queryFn: () => searchContractorFn({ data: { term: contractorSearch } }),
    enabled: contractorPickerOpen && contractorSearch.length >= 2,
  });

  // Reset contratante cuando cambia el titular o el toggle
  useEffect(() => {
    if (contractorSame) setContractor(null);
  }, [contractorSame, clientId]);

  async function ensureContractor(): Promise<string | null> {
    if (contractorSame) {
      if (!clientId) return null;
      try {
        const row = await fromClientFn({ data: { client_id: clientId } });
        return (row as any)?.id ?? null;
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudo enlazar el contratante");
        return null;
      }
    }
    return contractor?.id ?? null;
  }

  async function submitCreator(force = false) {
    if (!creatorForm.full_name.trim()) return toast.error("Nombre requerido");
    setCreatorSaving(true);
    try {
      const res = await createContractorFn({
        data: { ...creatorForm, confirm_duplicate: force },
      }) as { duplicate: ContractorRow | null; created: ContractorRow | null };
      if (res.duplicate && !force) {
        setDuplicateConfirm(res.duplicate);
        return;
      }
      if (res.created) {
        setContractor(res.created);
        setContractorSame(false);
        setCreatorOpen(false);
        setCreatorForm(emptyContractorForm());
        toast.success("Contratante creado");
      }
    } catch (e: any) {
      const raw = String(e?.message ?? "");
      if (raw.includes("propio_contacto")) {
        toast.error("El número/correo coincide con tu propio contacto. Ingresa el contacto real del cliente.");
      } else {
        toast.error(raw || "No se pudo crear el contratante");
      }
    } finally {
      setCreatorSaving(false);
    }
  }

  // -------- COBERTURAS --------
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
    premium: "",
    sum_insured: "",
  });

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([
    { full_name: "", relationship: "", percentage: 100 },
  ]);
  const [dependents, setDependents] = useState<Dependent[]>([]);

  const sumPct = beneficiaries.reduce((s, b) => s + (Number(b.percentage) || 0), 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const contractorId = await ensureContractor();
      return createFn({
        data: {
          client_id: clientId,
          program_id: programId,
          policy_number: form.policy_number || null,
          certificate_number: form.certificate_number || null,
          issue_date: form.issue_date,
          start_date: form.start_date,
          end_date: form.end_date,
          contracting_party: (contractorSame
            ? clientLabel.split("—")[0]?.trim()
            : contractor?.full_name) || null,
          contractor_id: contractorId,
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
      });
    },
    onSuccess: (res) => {
      toast.success(`Certificado creado: ${res.folio}`);
      navigate({ to: "/policies/$policyId", params: { policyId: res.id } });
    },
    onError: (err: any) => toast.error(err?.message ?? "Error al crear certificado"),
  });

  const canSubmit =
    !!clientId &&
    !!programId &&
    form.start_date &&
    form.end_date &&
    (contractorSame || !!contractor) &&
    beneficiaries.every((b) => b.full_name && b.relationship && b.percentage > 0) &&
    Math.round(sumPct) === 100;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/policies" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <h1 className="text-2xl font-semibold">Nuevo certificado</h1>
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
            {!clientId && clientSearch.length >= 2 && clientResults.length === 0 && (
              <div className="mt-1">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => navigate({ to: "/clients/new" })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Crear nuevo cliente titular
                </Button>
              </div>
            )}
          </div>

          {/* ---- Contratante ---- */}
          <div className="md:col-span-2 rounded-lg border p-3 bg-muted/20 space-y-3">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">Contratante</div>
                <div className="text-xs text-muted-foreground">
                  Persona que paga el certificado (puede diferir del asegurado).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="contractor-same"
                  checked={contractorSame}
                  onCheckedChange={setContractorSame}
                />
                <Label htmlFor="contractor-same" className="text-sm cursor-pointer">
                  Mismo que el cliente titular
                </Label>
              </div>
            </div>

            {!contractorSame && (
              <div className="space-y-2">
                {contractor ? (
                  <div className="flex items-center justify-between rounded-md border bg-background p-2 text-sm">
                    <div>
                      <div className="font-medium">{contractor.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {contractor.phone || contractor.email || contractor.curp || "—"}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setContractor(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-8"
                          placeholder="Buscar contratante por nombre, CURP, tel o email…"
                          value={contractorSearch}
                          onChange={(e) => setContractorSearch(e.target.value)}
                          onFocus={() => setContractorPickerOpen(true)}
                        />
                      </div>
                      <Button
                        type="button" variant="outline"
                        onClick={() => setCreatorOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Crear nuevo
                      </Button>
                    </div>
                    {contractorSearch.length >= 2 && (
                      <div className="border rounded-md max-h-52 overflow-auto bg-popover">
                        {(contractorResults as ContractorRow[]).length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            Sin resultados. Puedes crearlo desde “Crear nuevo”.
                          </div>
                        ) : (
                          (contractorResults as ContractorRow[]).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                              onClick={() => { setContractor(c); setContractorSearch(""); }}
                            >
                              <div className="font-medium">{c.full_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {[c.phone, c.email, c.curp].filter(Boolean).join(" · ")}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>No. Certificado HIR</Label>
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
          {mutation.isPending ? "Creando…" : "Crear certificado"}
        </Button>
      </div>

      {/* ---- Modal: crear contratante ---- */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo contratante</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre completo *</Label>
              <Input value={creatorForm.full_name} onChange={(e) => setCreatorForm({ ...creatorForm, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CURP</Label>
                <Input value={creatorForm.curp} onChange={(e) => setCreatorForm({ ...creatorForm, curp: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={creatorForm.phone} onChange={(e) => setCreatorForm({ ...creatorForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Correo</Label>
              <Input type="email" value={creatorForm.email} onChange={(e) => setCreatorForm({ ...creatorForm, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Calle</Label>
                <Input value={creatorForm.street} onChange={(e) => setCreatorForm({ ...creatorForm, street: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={creatorForm.number} onChange={(e) => setCreatorForm({ ...creatorForm, number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Colonia</Label>
                <Input value={creatorForm.colonia} onChange={(e) => setCreatorForm({ ...creatorForm, colonia: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CP</Label>
                <Input value={creatorForm.zip} onChange={(e) => setCreatorForm({ ...creatorForm, zip: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad</Label>
                <Input value={creatorForm.city} onChange={(e) => setCreatorForm({ ...creatorForm, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Input value={creatorForm.state} onChange={(e) => setCreatorForm({ ...creatorForm, state: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatorOpen(false)}>Cancelar</Button>
            <Button disabled={creatorSaving} onClick={() => submitCreator(false)}>
              <Check className="h-4 w-4 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Confirmación de duplicado ---- */}
      <AlertDialog
        open={!!duplicateConfirm}
        onOpenChange={(v) => { if (!v) setDuplicateConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contacto ya registrado</AlertDialogTitle>
            <AlertDialogDescription>
              Este número/correo ya está registrado con el contratante{" "}
              <strong>{duplicateConfirm?.full_name}</strong>. ¿Confirmas que es correcto?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateConfirm(null)}>
              Corregir datos
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setDuplicateConfirm(null); submitCreator(true); }}
            >
              Confirmar y guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
