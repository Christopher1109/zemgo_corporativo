import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { createCompany, updateCompany, deleteCompany } from "@/lib/companies.functions";
import { groupLabels, isFutCare, GROUP_TYPE_LABEL } from "@/lib/group-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CompanyLike = {
  id: string;
  legal_name: string;
  rfc?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_full?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  is_active: boolean;
  group_type?: string | null;
  billing_mode?: string | null;
  location?: string | null;
  coverage_start?: string | null;
  coverage_end?: string | null;
  pricing_mode?: string | null;
  unit_price?: number | string | null;
  flat_amount?: number | string | null;
  programs?: { code?: string | null } | null;
};

type FormState = Omit<CompanyLike, "id">;

function validate(form: FormState, fut: boolean): string | null {
  if (fut) {
    if (!form.group_type) return "Elige el tipo: torneo, equipo o club.";
    if ((form.legal_name ?? "").trim().length < 2) return "El nombre del torneo o equipo es obligatorio.";
    if (!(form.contact_name ?? "").trim()) return "El nombre del encargado es obligatorio.";
    if ((form.phone ?? "").replace(/\D/g, "").length !== 10) return "El teléfono del encargado debe tener 10 dígitos.";
    if (!form.billing_mode) return "Elige el modo de pago.";
    if (!form.coverage_start || !form.coverage_end) return "Captura cuándo empieza y cuándo termina la cobertura.";
    if (form.coverage_end <= form.coverage_start) return "La fecha de fin de cobertura debe ser posterior al inicio.";
    if (form.pricing_mode === "flat") {
      if (!(Number(form.flat_amount) > 0)) return "Captura el costo total acordado del torneo.";
    } else if (!(Number(form.unit_price) > 0)) return "Captura el costo por jugador.";
    return null;
  }
  if ((form.legal_name ?? "").trim().length < 2) return "La razón social es obligatoria.";
  return null;
}

function payload(form: FormState, fut: boolean) {
  const t = (v?: string | null) => v?.trim() || null;
  return {
    legal_name: form.legal_name.trim(),
    rfc: fut ? null : t(form.rfc),
    contact_name: t(form.contact_name),
    email: t(form.email),
    phone: fut ? (form.phone ?? "").replace(/\D/g, "") : t(form.phone),
    address_full: fut ? null : t(form.address_full),
    city: t(form.city),
    state: t(form.state),
    notes: t(form.notes),
    ...(fut
      ? {
          group_type: form.group_type as "torneo" | "equipo" | "club",
          billing_mode: (form.pricing_mode === "flat" ? "company" : form.billing_mode ?? "company") as "company" | "individual",
          location: t(form.location),
          coverage_start: form.coverage_start || null,
          coverage_end: form.coverage_end || null,
          pricing_mode: (form.pricing_mode === "flat" ? "flat" : "per_person") as "flat" | "per_person",
          unit_price: form.pricing_mode === "flat" ? null : Number(form.unit_price),
          flat_amount: form.pricing_mode === "flat" ? Number(form.flat_amount) : null,
        }
      : {}),
  };
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${span ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function CompanyFormFields({
  form,
  setForm,
  fut,
  showBillingMode = true,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  fut: boolean;
  showBillingMode?: boolean;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  if (fut) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo *" span>
          <div className="flex gap-2">
            {(["torneo", "equipo", "club"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.group_type === t ? "default" : "outline"}
                size="sm"
                onClick={() => setForm({ ...form, group_type: t })}
              >
                {GROUP_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Nombre del torneo o equipo *" span>
          <Input value={form.legal_name} onChange={set("legal_name")} />
        </Field>
        <Field label="Nombre del encargado / persona de contacto *">
          <Input value={form.contact_name ?? ""} onChange={set("contact_name")} />
        </Field>
        <Field label="Teléfono del contacto * (10 dígitos)">
          <Input inputMode="numeric" maxLength={10} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
        </Field>
        <Field label="Email del contacto">
          <Input type="email" value={form.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="Ubicación / sede donde se juega">
          <Input value={form.location ?? ""} onChange={set("location")} />
        </Field>
        <Field label="Ciudad">
          <Input value={form.city ?? ""} onChange={set("city")} />
        </Field>
        <Field label="Estado">
          <Input value={form.state ?? ""} onChange={set("state")} />
        </Field>
        <Field label="Inicio de cobertura *">
          <Input type="date" value={form.coverage_start ?? ""} onChange={set("coverage_start")} />
        </Field>
        <Field label="Fin de cobertura *">
          <Input type="date" value={form.coverage_end ?? ""} onChange={set("coverage_end")} />
        </Field>
        <Field label="Costo *" span>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { v: "per_person", t: "Costo por jugador", d: "Se cobra el costo × cada jugador registrado." },
              { v: "flat", t: "Costo total del torneo", d: "Una cantidad fija acordada, sin importar cuántos jugadores sean." },
            ].map((o) => (
              <label
                key={o.v}
                className={`cursor-pointer rounded-md border p-3 text-sm ${(form.pricing_mode ?? "per_person") === o.v ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <input type="radio" name="pricing_mode" checked={(form.pricing_mode ?? "per_person") === o.v} onChange={() => setForm({ ...form, pricing_mode: o.v })} />
                  {o.t}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{o.d}</div>
              </label>
            ))}
          </div>
          {(form.pricing_mode ?? "per_person") === "flat" ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total del torneo $</span>
              <Input inputMode="decimal" className="max-w-40" value={String(form.flat_amount ?? "")} onChange={(e) => setForm({ ...form, flat_amount: e.target.value.replace(/[^\d.]/g, "") })} />
              <span className="text-sm text-muted-foreground">MXN</span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Costo por jugador $</span>
              <Input inputMode="decimal" className="max-w-40" value={String(form.unit_price ?? "")} onChange={(e) => setForm({ ...form, unit_price: e.target.value.replace(/[^\d.]/g, "") })} />
              <span className="text-sm text-muted-foreground">MXN</span>
            </div>
          )}
          {(form.pricing_mode ?? "per_person") === "flat" && form.billing_mode === "individual" && (
            <p className="mt-1 text-xs text-amber-700">Con costo total del torneo, el cobro siempre lo paga el encargado.</p>
          )}
        </Field>
        {showBillingMode && (form.pricing_mode ?? "per_person") !== "flat" && (
          <Field label="Modo de pago *" span>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: "company", t: "Paga el encargado (un solo cobro por todos)", d: "Se genera un solo cobro grupal por todos los certificados. Solo el encargado recibe recordatorios." },
                { v: "individual", t: "Cada quien paga su certificado", d: "Cada asegurado tiene su propio pago pendiente y recibe su link de pago." },
              ].map((o) => (
                <label
                  key={o.v}
                  className={`cursor-pointer rounded-md border p-3 text-sm ${form.billing_mode === o.v ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <input type="radio" name="billing_mode" checked={form.billing_mode === o.v} onChange={() => setForm({ ...form, billing_mode: o.v })} />
                    {o.t}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{o.d}</div>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label="Notas" span>
          <Input value={form.notes ?? ""} onChange={set("notes")} />
        </Field>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Razón social *" span>
        <Input value={form.legal_name} onChange={set("legal_name")} />
      </Field>
      <Field label="RFC">
        <Input value={form.rfc ?? ""} onChange={set("rfc")} />
      </Field>
      <Field label="Nombre del contacto">
        <Input value={form.contact_name ?? ""} onChange={set("contact_name")} />
      </Field>
      <Field label="Email">
        <Input type="email" value={form.email ?? ""} onChange={set("email")} />
      </Field>
      <Field label="Teléfono">
        <Input value={form.phone ?? ""} onChange={set("phone")} />
      </Field>
      <Field label="Ciudad">
        <Input value={form.city ?? ""} onChange={set("city")} />
      </Field>
      <Field label="Estado">
        <Input value={form.state ?? ""} onChange={set("state")} />
      </Field>
      <Field label="Domicilio" span>
        <Input value={form.address_full ?? ""} onChange={set("address_full")} />
      </Field>
      <Field label="Notas" span>
        <Input value={form.notes ?? ""} onChange={set("notes")} />
      </Field>
    </div>
  );
}

const EMPTY: FormState = {
  legal_name: "", rfc: "", contact_name: "", email: "", phone: "", address_full: "", city: "", state: "", notes: "",
  is_active: true, group_type: null, billing_mode: "company", location: "",
  coverage_start: "", coverage_end: "", pricing_mode: "per_person", unit_price: "", flat_amount: "",
};

export function CreateCompanyDialog({
  programId,
  programCode,
  open,
  onOpenChange,
}: {
  programId: string | null;
  programCode?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fn = useServerFn(createCompany);
  const fut = isFutCare(programCode);
  const L = groupLabels(programCode);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  async function save() {
    if (!programId) return toast.error("Selecciona un programa.");
    const err = validate(form, fut);
    if (err) return toast.error(err);
    if (busy) return;
    setBusy(true);
    let res: { id: string; contact_warning?: string | null };
    try {
      res = await fn({ data: { program_id: programId, ...payload(form, fut) } });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
      setBusy(false);
      return;
    }
    // Una vez creado, siempre cerrar y navegar (evita duplicados al reintentar).
    toast.success(`${L.singular} creado`);
    if (res.contact_warning) toast.warning(res.contact_warning);
    onOpenChange(false);
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["companies"] });
    navigate({ to: "/companies/$companyId", params: { companyId: res.id } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L.newLabel}</DialogTitle>
          <DialogDescription>
            {fut
              ? "Registra el torneo o equipo y a su encargado. El encargado podrá entrar al portal con su nombre y los últimos 4 dígitos de su teléfono."
              : "Captura los datos de la empresa. Después podrás cargar a sus asegurados."}
          </DialogDescription>
        </DialogHeader>
        <CompanyFormFields form={form} setForm={setForm} fut={fut} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditCompanyDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  company: CompanyLike;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updateCompany);
  const fut = isFutCare(company.programs?.code) || !!company.group_type;
  const L = groupLabels(fut ? "FUTCARE" : company.programs?.code);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(company);

  useEffect(() => {
    if (open)
      setForm({
        ...company,
        billing_mode: company.billing_mode ?? "company",
        pricing_mode: company.pricing_mode ?? "per_person",
        coverage_start: company.coverage_start ? String(company.coverage_start).slice(0, 10) : "",
        coverage_end: company.coverage_end ? String(company.coverage_end).slice(0, 10) : "",
      });
  }, [open, company]);

  async function save() {
    const err = validate(form, fut);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const p: any = payload(form, fut);
      // El modo de pago se cambia desde la ficha (con confirmación y recálculo del cobro),
      // salvo con costo total del torneo, que siempre lo paga el encargado.
      if (p.pricing_mode !== "flat") delete p.billing_mode;
      const r = await fn({ data: { company_id: company.id, ...p, is_active: form.is_active } });
      toast.success(`${L.singular} actualizado`);
      if (r?.contact_warning) toast.warning(r.contact_warning);
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ["companies"] });
      await qc.invalidateQueries({ queryKey: ["company", company.id] });
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {L.singularLower}</DialogTitle>
          <DialogDescription>Actualiza la información y su contacto.</DialogDescription>
        </DialogHeader>
        <CompanyFormFields form={form} setForm={setForm} fut={fut} showBillingMode={false} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Activo
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCompanyDialog({
  company,
  open,
  onOpenChange,
  onDeleted,
}: {
  company: Pick<CompanyLike, "id" | "legal_name" | "group_type" | "programs"> & { asegurados?: number; certificados?: number };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(deleteCompany);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setConfirm("");
  }, [open]);

  async function remove() {
    setBusy(true);
    try {
      await fn({ data: { company_id: company.id } });
      toast.success("Empresa eliminada");
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ["companies"] });
      onDeleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> Eliminar {company.group_type ? "torneo o equipo" : "empresa"}
          </DialogTitle>
          <DialogDescription>
            Se eliminará <span className="font-medium text-foreground">{company.legal_name}</span>. Sus asegurados y
            certificados no se borran: quedan como clientes independientes sin grupo asignado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Escribe <span className="font-mono">ELIMINAR</span> para confirmar</Label>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ELIMINAR" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy || confirm !== "ELIMINAR"} onClick={remove}>
            {busy ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
