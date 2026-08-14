import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type ClientRow = Record<string, any>;

const FIELDS: Array<{ key: string; label: string; type?: string }> = [
  { key: "first_name", label: "Nombre(s)" },
  { key: "last_name", label: "Apellidos" },
  { key: "curp", label: "CURP" },
  { key: "rfc", label: "RFC" },
  { key: "date_of_birth", label: "Fecha de nacimiento", type: "date" },
  { key: "phone", label: "Teléfono" },
  { key: "phone_alt", label: "Teléfono alterno" },
  { key: "email", label: "Email", type: "email" },
  { key: "street", label: "Calle" },
  { key: "number", label: "Número" },
  { key: "colonia", label: "Colonia" },
  { key: "city", label: "Ciudad" },
  { key: "state", label: "Estado" },
  { key: "zip", label: "C.P." },
];

export function EditClientDialog({ client }: { client: ClientRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...FIELDS.map((f) => f.key), "gender", "marital_status", "address_full"].map((k) => [
        k,
        (client?.[k] ?? "") as string,
      ]),
    ),
  );

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.first_name?.trim()) return toast.error("El nombre es obligatorio.");
    setBusy(true);
    const payload: Record<string, any> = {};
    for (const k of Object.keys(form)) {
      const v = typeof form[k] === "string" ? form[k].trim() : form[k];
      payload[k] = v === "" ? null : v;
    }
    if (payload.curp) payload.curp = String(payload.curp).toUpperCase();
    if (payload.rfc) payload.rfc = String(payload.rfc).toUpperCase();

    const { error } = await supabase.from("clients").update(payload as any).eq("id", client.id);
    setBusy(false);
    if (error) {
      if ((error as any).code === "23505") return toast.error("Ya existe otro cliente con esa CURP.");
      return toast.error(error.message);
    }
    toast.success("Datos del cliente actualizados.");
    await qc.invalidateQueries({ queryKey: ["client", client.id] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-2" /> Editar datos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Actualiza los datos personales y de contacto del titular.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.type ?? "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}

          <div className="space-y-1">
            <Label className="text-xs">Género</Label>
            <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin especificar</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Femenino</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Estado civil</Label>
            <Select
              value={form.marital_status || "none"}
              onValueChange={(v) => set("marital_status", v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin especificar</SelectItem>
                <SelectItem value="soltero">Soltero(a)</SelectItem>
                <SelectItem value="casado">Casado(a)</SelectItem>
                <SelectItem value="union_libre">Unión libre</SelectItem>
                <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                <SelectItem value="viudo">Viudo(a)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Domicilio completo (opcional)</Label>
            <Input value={form.address_full ?? ""} onChange={(e) => set("address_full", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
