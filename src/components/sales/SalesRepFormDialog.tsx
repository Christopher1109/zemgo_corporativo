import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { createSalesRep, updateSalesRep } from "@/lib/sales-reps.functions";
import { saveSalesRepAccount } from "@/lib/sales-rep-accounts.functions";
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
  email?: string | null;
  user_id?: string | null;
  metadata?: any;
};

/** Registration form URL per program code. */
export const PROGRAM_FORM_URLS: Record<string, string> = {
  ABC: "https://www.zemgoseguros.com.mx/abc-de-proteccion",
  MCV: "https://www.zemgoseguros.com.mx/manos-con-valor",
  FUTCARE: "https://www.zemgoseguros.com.mx/fut-care",
};

function withRef(url: string, slug: string) {
  return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(slug)}`;
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return "Zv" + Array.from(arr, (n) => chars[n % chars.length]).join("") + "!";
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copiado"),
    () => toast.error("No se pudo copiar"),
  );
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`truncate text-xs ${mono ? "font-mono" : ""}`} title={value}>
          {value}
        </div>
      </div>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(value)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
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
  const accountFn = useServerFn(saveSalesRepAccount);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");
  const [programId, setProgramId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | { slug: string; programId: string; email: string; password: string }>(null);

  const savedPassword: string = rep?.metadata?.login_password ?? "";

  useEffect(() => {
    if (!open) return;
    setName(rep?.full_name ?? "");
    setCode(rep?.code ?? "");
    setSlug(rep?.ref_slug ?? "");
    setProgramId(rep?.program_id ?? "");
    setActive(rep?.is_active ?? true);
    setEmail(rep?.email ?? "");
    setPassword(rep?.id ? savedPassword : genPassword());
    setDone(null);
  }, [open, rep]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveSlug = slug.trim() ? slugify(slug) : slugify(name);

  function linksFor(pid: string, s: string) {
    if (!s) return [];
    const list = pid ? programs.filter((p) => p.id === pid) : programs;
    return list
      .filter((p) => PROGRAM_FORM_URLS[p.code])
      .map((p) => ({ name: p.name, url: withRef(PROGRAM_FORM_URLS[p.code], s) }));
  }

  function suggestEmail() {
    const base = effectiveSlug.replace(/_/g, ".") || "vendedor";
    setEmail(`${base}@zemgo.local`);
  }

  async function save() {
    if (name.trim().length < 3) return toast.error("Escribe el nombre completo del vendedor");
    const wantsAccount = email.trim() !== "" || (!!rep?.id && password !== savedPassword && password !== "");
    if (wantsAccount) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Correo no válido");
      if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
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
      let id = rep?.id;
      if (id) await updateFn({ data: { id, ...payload } });
      else id = (await createFn({ data: payload }))?.id;

      const accountChanged =
        wantsAccount && (email.trim().toLowerCase() !== (rep?.email ?? "") || password !== savedPassword || !rep?.user_id);
      if (id && accountChanged) {
        await accountFn({ data: { sales_rep_id: id, email: email.trim(), password } });
      }
      await qc.invalidateQueries({ queryKey: ["sales-reps"] });
      await qc.invalidateQueries({ queryKey: ["sales-rep"] });
      toast.success(rep?.id ? "Vendedor actualizado" : "Vendedor creado");
      if (rep?.id) onOpenChange(false);
      else setDone({ slug: effectiveSlug, programId, email: wantsAccount ? email.trim() : "", password: wantsAccount ? password : "" });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const links = linksFor(done.programId, done.slug);
    const all = [
      `Vendedor: ${name.trim()}`,
      ...links.map((l) => `${l.name}: ${l.url}`),
      done.email ? `Usuario: ${done.email}` : "",
      done.password ? `Contraseña: ${done.password}` : "",
    ].filter(Boolean).join("\n");
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vendedor creado</DialogTitle>
            <DialogDescription>Copia estas ligas y accesos para enviárselos al vendedor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {links.map((l) => <CopyRow key={l.url} label={l.name} value={l.url} />)}
            {done.email && <CopyRow label="Usuario (correo)" value={done.email} />}
            {done.password && <CopyRow label="Contraseña" value={done.password} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => copy(all)}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar todo
            </Button>
            <Button onClick={() => onOpenChange(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const previewLinks = linksFor(programId, effectiveSlug);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rep?.id ? "Editar vendedor" : "Nuevo vendedor"}</DialogTitle>
          <DialogDescription>
            Cada liga lleva el identificador del vendedor; quien se registre por ella queda asignado a él automáticamente.
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
                <option value="">Los tres programas</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Identificador de liga (ref)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(name) || "salvador_cavazos"} />
          </div>

          {previewLinks.length > 0 && (
            <div className="space-y-1.5">
              <Label>Ligas del vendedor</Label>
              {previewLinks.map((l) => <CopyRow key={l.url} label={l.name} value={l.url} />)}
            </div>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">Acceso del vendedor</div>
            <div className="text-xs text-muted-foreground">
              Con este usuario el vendedor entra al sistema y solo ve su cartera y comisiones.
            </div>
            <div className="space-y-1.5">
              <Label>Correo / usuario</Label>
              <div className="flex gap-2">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="salvador.cavazos@zemgo.local" />
                <Button type="button" variant="outline" size="sm" onClick={suggestEmail}>Generar</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={() => setPassword(genPassword())} title="Generar nueva">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => password && copy(password)} title="Copiar">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {rep?.id && !rep?.user_id && (
              <p className="text-[11px] text-muted-foreground">Este vendedor aún no tiene acceso; escribe un correo para crearlo.</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Vendedor activo</div>
              <div className="text-xs text-muted-foreground">Los inactivos ya no reciben asignaciones ni pueden entrar.</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
