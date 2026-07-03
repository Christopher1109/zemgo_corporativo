import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { portalMe, portalUpdateProfile } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/portal/_app/profile")({
  component: ProfilePage,
});

const EDITABLE = ["phone", "email", "street", "number", "colonia", "city", "state", "zip"] as const;
const READONLY = ["first_name", "last_name", "curp", "date_of_birth", "gender"] as const;

function buildAddressFull(f: Record<string, string>): string {
  return [f.street, f.number, f.colonia, f.city, f.state, f.zip]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function ProfilePage() {
  const me = useServerFn(portalMe);
  const update = useServerFn(portalUpdateProfile);
  const [client, setClient] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const addressRef = useRef<HTMLDivElement | null>(null);
  const streetRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const r: any = await me();
      if (r?.authenticated) {
        setClient(r.client);
        const init: Record<string, string> = {};
        EDITABLE.forEach((k) => (init[k] = r.client[k] ?? ""));
        setForm(init);
      }
    })();
  }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await update({ data: { changes: form } });
      // Reflect address_full locally so the banner disappears immediately
      setClient((c: any) =>
        c ? { ...c, ...form, address_full: buildAddressFull(form) } : c,
      );
      toast.success("Datos actualizados. Notificaremos al equipo Zemgo.");
    } catch {
      toast.error("No fue posible actualizar");
    } finally {
      setSaving(false);
    }
  }

  if (!client) return <div className="text-slate-500">Cargando…</div>;

  const hasAddress =
    !!(client.address_full ?? "").trim() ||
    !!buildAddressFull(form).trim();

  const focusAddress = () => {
    addressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => streetRef.current?.focus(), 300);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis Datos</h1>

      {!hasAddress && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Completa tu dirección para finalizar tu registro
            </p>
            <p className="text-xs text-amber-800/80">
              Es opcional pero ayuda a Zemgo a contactarte en caso de un siniestro.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-900 hover:bg-amber-100"
            onClick={focusAddress}
          >
            Completar ahora
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-6">
          <section>
            <h2 className="text-sm font-semibold uppercase text-slate-500">Datos personales</h2>
            <p className="mt-1 text-xs text-slate-500">Para modificar estos datos, contacta a soporte.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {READONLY.map((k) => (
                <div key={k}>
                  <div className="text-xs text-slate-500 capitalize">{k.replace("_", " ")}</div>
                  <div className="font-medium">{client[k] ?? "—"}</div>
                </div>
              ))}
            </div>
          </section>

          <form onSubmit={save} className="space-y-4">
            <h2 className="text-sm font-semibold uppercase text-slate-500">
              Contacto y dirección
            </h2>
            <div ref={addressRef} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {EDITABLE.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="capitalize text-xs">{k.replace("_", " ")}</Label>
                  <Input
                    ref={k === "street" ? streetRef : undefined}
                    value={form[k] ?? ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

