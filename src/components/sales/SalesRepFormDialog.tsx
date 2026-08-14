import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createSalesRep, updateSalesRep } from "@/lib/sales-reps.functions";
import { useProgram } from "@/lib/program-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SalesRepFormValues = {
  id?: string;
  full_name?: string | null;
  code?: string | null;
  ref_slug?: string | null;
  program_id?: string | null;
  referral_source?: string | null;
  is_active?: boolean | null;
};

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function SalesRepFormDialog({
  open,
  onOpenChange,
  rep,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rep?: SalesRepFormValues | null;
}) {
  const { programs } = useProgram();
  const qc = useQueryClient();
  const createFn = useServerFn(createSalesRep);
  const updateFn = useServerFn(updateSalesRep);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(rep?.full_name ?? "");
    setCode(rep?.code ?? "");
    setSlug(rep?.ref_slug ?? "");
    setProgramId(rep?.program_id ?? "");
    setActive(rep?.is_active ?? true);
  }, [open, rep]);

  const effectiveSlug = slug.trim() ? slugify(slug) : slugify(name);

  async function save() {
    if (name.trim().length < 3) {
      toast.error("Escribe el nombre completo del vendedor");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: name.trim(),
        code: code.trim() || null,
        ref_slug: effectiveSlug || null,
        program_id: programId || null,
        is_active: active,
      };
      if (rep?.id) await updateFn({ data: { id: rep.id, ...payload } });
      else await createFn({ data: payload });
      await qc.invalidateQueries({ queryKey: ["sales-reps"] });
      await qc.invalidateQueries({ queryKey: ["sales-rep"] });
      toast.success(rep?.id ? "Vendedor actualizado" : "Vendedor creado");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rep?.id ? "Editar vendedor" : "Nuevo vendedor"}</DialogTitle>
          <DialogDescription>
            El identificador de liga (<span className="font-mono">?ref=</span>) es lo que llega en el campo
            “asesor” del formulario web: si coincide, el cliente se asigna a este vendedor automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre completo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salvador Cavazos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="v08" />
            </div>
            <div className="space-y-1.5">
              <Label>Programa</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                <option value="">Todos / sin definir</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Identificador de liga (ref)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={slugify(name) || "salvador_cavazos"}
            />
            {effectiveSlug && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">
                ?ref={effectiveSlug}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Vendedor activo</div>
              <div className="text-xs text-muted-foreground">
                Los inactivos ya no reciben asignaciones automáticas nuevas.
              </div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
