import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { updateCompany, deleteCompany } from "@/lib/companies.functions";
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
};

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
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CompanyLike>(company);

  useEffect(() => {
    if (open) setForm(company);
  }, [open, company]);

  async function save() {
    if (form.legal_name.trim().length < 2) {
      toast.error("La razón social es obligatoria.");
      return;
    }
    setBusy(true);
    try {
      await fn({
        data: {
          company_id: company.id,
          legal_name: form.legal_name.trim(),
          rfc: form.rfc?.trim() || null,
          contact_name: form.contact_name?.trim() || null,
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          address_full: form.address_full?.trim() || null,
          city: form.city?.trim() || null,
          state: form.state?.trim() || null,
          notes: form.notes?.trim() || null,
          is_active: form.is_active,
        },
      });
      toast.success("Empresa actualizada");
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
          <DialogTitle>Editar empresa</DialogTitle>
          <DialogDescription>Actualiza la información de la empresa y su contacto.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Razón social *</Label>
            <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input value={form.rfc ?? ""} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre del contacto</Label>
            <Input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ciudad</Label>
            <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Input value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Domicilio</Label>
            <Input value={form.address_full ?? ""} onChange={(e) => setForm({ ...form, address_full: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notas</Label>
            <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Empresa activa
          </label>
        </div>
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
  company: Pick<CompanyLike, "id" | "legal_name"> & { asegurados?: number; certificados?: number };
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
            <Trash2 className="h-4 w-4 text-destructive" /> Eliminar empresa
          </DialogTitle>
          <DialogDescription>
            Se eliminará <span className="font-medium text-foreground">{company.legal_name}</span>. Sus asegurados y
            certificados no se borran: quedan como clientes independientes sin empresa asignada.
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
