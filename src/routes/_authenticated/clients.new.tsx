import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProgram } from "@/lib/program-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({ meta: [{ title: "Nuevo cliente — ZEMGO" }] }),
  component: NewClient,
});

const empty = {
  first_name: "", last_name: "", curp: "", rfc: "",
  date_of_birth: "", gender: "", marital_status: "",
  email: "", phone: "",
  street: "", number: "", colonia: "", city: "", state: "", zip: "",
  // ABC-only free-text list of cónyuge/hijos shown on the certificate.
  dependents_text: "",
};

function NewClient() {
  const navigate = useNavigate();
  const { programs, activeProgram } = useProgram();
  const { user } = useAuth();
  const [form, setForm] = useState({ ...empty });
  const [programId, setProgramId] = useState<string>(activeProgram?.id ?? "");
  const [busy, setBusy] = useState(false);

  const selectedProgram = programs.find((p) => p.id === programId);
  const programCode = (selectedProgram?.code ?? "").toUpperCase();
  const isABC = programCode === "ABC";

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function enrollAndGo(clientId: string, action: "create" | "enroll") {
    const { data: existingCp } = await supabase
      .from("client_programs")
      .select("id")
      .eq("client_id", clientId)
      .eq("program_id", programId)
      .maybeSingle();

    if (!existingCp) {
      const { error: cpErr } = await supabase.from("client_programs").insert({
        client_id: clientId, program_id: programId, status: "prospect",
      });
      if (cpErr) { setBusy(false); return toast.error(cpErr.message); }
    }

    await supabase.from("audit_log").insert({
      user_id: user?.id, program_id: programId,
      entity_type: "client", entity_id: clientId,
      action: action === "create" ? "create" : "enroll_program",
      diff: { program_id: programId },
    });

    setBusy(false);
    toast.success(action === "create" ? "Cliente creado" : "Cliente afiliado al programa");
    navigate({ to: "/clients" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!programId) return toast.error("Selecciona un programa");
    setBusy(true);
    const curp = form.curp.trim().toUpperCase();
    const { dependents_text, ...rest } = form;
    const payload: any = {
      ...rest,
      curp,
      // Non-ABC programs don't capture marital_status — clear it to keep data tidy.
      marital_status: isABC ? rest.marital_status : null,
      rfc: rest.rfc ? rest.rfc.trim().toUpperCase() : null,
      date_of_birth: rest.date_of_birth || null,
      created_by: user?.id,
      metadata: isABC && dependents_text.trim()
        ? { dependents_text: dependents_text.trim() }
        : {},
    };
    Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));

    const { data: client, error } = await supabase
      .from("clients").insert(payload).select("id").single();

    if (error) {
      // Duplicate CURP → look up existing client and offer to enroll
      if ((error as any).code === "23505" || error.message.includes("clients_curp_key")) {
        const { data: existing } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .eq("curp", curp)
          .maybeSingle();
        if (existing) {
          toast.info(
            `Ya existe un cliente con ese CURP: ${existing.first_name} ${existing.last_name}. Lo afiliaré al programa seleccionado.`,
          );
          return enrollAndGo(existing.id, "enroll");
        }
        setBusy(false);
        return toast.error("Ya existe un cliente con ese CURP.");
      }
      setBusy(false);
      return toast.error(error.message);
    }

    return enrollAndGo(client.id, "create");
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
            {isABC && (
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
            )}
          </CardContent>
        </Card>

        {isABC && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dependientes (cónyuge e hijos)</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Nombres separados por coma — aparecerán en el certificado ABC">
                <Textarea
                  rows={3}
                  value={form.dependents_text}
                  onChange={set("dependents_text")}
                  placeholder="Ej. María López (cónyuge), Juan Pérez (hijo), Ana Pérez (hija)"
                />
              </Field>
            </CardContent>
          </Card>
        )}

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
