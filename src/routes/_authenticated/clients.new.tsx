import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProgram } from "@/lib/program-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({ meta: [{ title: "Nuevo cliente — HOPE Consulting" }] }),
  component: NewClient,
});

const empty = {
  first_name: "", last_name: "", curp: "", rfc: "",
  date_of_birth: "", gender: "", marital_status: "",
  email: "", phone: "",
  street: "", number: "", colonia: "", city: "", state: "", zip: "",
};

function NewClient() {
  const navigate = useNavigate();
  const { programs, activeProgram } = useProgram();
  const { user } = useAuth();
  const [form, setForm] = useState({ ...empty });
  const [programId, setProgramId] = useState<string>(activeProgram?.id ?? "");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!programId) return toast.error("Selecciona un programa");
    setBusy(true);
    const payload: any = {
      ...form,
      date_of_birth: form.date_of_birth || null,
      created_by: user?.id,
      sales_rep_id: user?.id,
    };
    Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));
    const { data: client, error } = await supabase.from("clients").insert(payload).select("id").single();
    if (error) { setBusy(false); return toast.error(error.message); }

    const { error: cpErr } = await supabase.from("client_programs").insert({
      client_id: client.id, program_id: programId, status: "prospect",
    });
    if (cpErr) { setBusy(false); return toast.error(cpErr.message); }

    await supabase.from("audit_log").insert({
      user_id: user?.id, program_id: programId,
      entity_type: "client", entity_id: client.id,
      action: "create", diff: payload,
    });

    setBusy(false);
    toast.success("Cliente creado");
    navigate({ to: "/clients" });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
        <p className="text-sm text-muted-foreground">Captura los datos del prospecto y selecciona el programa al que se afilia.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Programa</CardTitle></CardHeader>
          <CardContent>
            <Label>Afiliar a programa *</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger className="mt-1.5 max-w-md"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color_primary }} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <Field label="Nombre(s) *"><Input required value={form.first_name} onChange={set("first_name")} /></Field>
            <Field label="Apellidos *"><Input required value={form.last_name} onChange={set("last_name")} /></Field>
            <Field label="CURP *"><Input required maxLength={18} value={form.curp} onChange={set("curp")} className="uppercase font-mono" /></Field>
            <Field label="RFC"><Input maxLength={13} value={form.rfc} onChange={set("rfc")} className="uppercase font-mono" /></Field>
            <Field label="Fecha de nacimiento"><Input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></Field>
            <Field label="Género">
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                  <SelectItem value="O">Otro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estado civil">
              <Select value={form.marital_status} onValueChange={(v) => setForm((f) => ({ ...f, marital_status: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="soltero">Soltero(a)</SelectItem>
                  <SelectItem value="casado">Casado(a)</SelectItem>
                  <SelectItem value="union_libre">Unión libre</SelectItem>
                  <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                  <SelectItem value="viudo">Viudo(a)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Contacto</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={set("phone")} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Domicilio</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <Field label="Calle" className="md:col-span-2"><Input value={form.street} onChange={set("street")} /></Field>
            <Field label="Número"><Input value={form.number} onChange={set("number")} /></Field>
            <Field label="Colonia"><Input value={form.colonia} onChange={set("colonia")} /></Field>
            <Field label="Ciudad"><Input value={form.city} onChange={set("city")} /></Field>
            <Field label="Estado"><Input value={form.state} onChange={set("state")} /></Field>
            <Field label="C.P."><Input value={form.zip} onChange={set("zip")} /></Field>
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/clients" })}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cliente"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
