import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, Plus, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
const forbiddenMsg = (m: string) => (m === "forbidden" ? "Solo un administrador puede cambiar esto." : m);

type Status = {
  enabled: boolean;
  emails: string[];
  emails_by_program: Record<string, string[]>;
  programs: { code: string; name: string }[];
  sent_30d: number;
};

/** Lista editable de correos con botón de prueba. */
function EmailList(props: {
  emails: string[];
  onSave: (list: string[]) => Promise<boolean>;
  onTest: () => void;
  testing: boolean;
  result: string | null;
  emptyHint: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(list: string[], okMsg: string) {
    setBusy(true);
    const ok = await props.onSave(list);
    setBusy(false);
    if (ok) toast.success(okMsg);
    return ok;
  }

  async function add() {
    const e = draft.trim().toLowerCase();
    if (!isEmail(e)) return toast.error("Escribe un correo válido.");
    if (props.emails.includes(e)) return setDraft("");
    if (await save([...props.emails, e], "Correo agregado.")) setDraft("");
  }

  return (
    <div className="space-y-2">
      {props.emails.length === 0 && <p className="text-xs text-muted-foreground">{props.emptyHint}</p>}
      <div className="flex flex-wrap gap-2">
        {props.emails.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
            {e}
            <button type="button" disabled={busy} aria-label={`Quitar ${e}`} className="text-muted-foreground hover:text-foreground"
              onClick={() => save(props.emails.filter((x) => x !== e), "Correo quitado.")}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); add(); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="nombre@semgo.mx" className="w-[240px]" type="email" />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Agregar
        </Button>
        <Button type="button" variant="secondary" onClick={props.onTest} disabled={props.testing}>
          {props.testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Probar
        </Button>
      </form>
      {props.result && <p className="text-xs">{props.result}</p>}
    </div>
  );
}

/** Aviso por correo al equipo cuando un cliente nuevo hace su primer pago, con correos por programa. */
export function NewClientEmailCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["new-client-notify-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("new_client_notify_status" as any);
      if (error) throw error;
      return data as Status;
    },
  });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const s = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["new-client-notify-status"] });

  async function toggle(v: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("set_new_client_notify" as any, { _enabled: v, _emails: s?.emails ?? [] });
    setBusy(false);
    if (error) return toast.error(forbiddenMsg(error.message));
    toast.success(v ? "Aviso de cliente nuevo encendido." : "Aviso de cliente nuevo apagado.");
    refresh();
  }

  async function saveGeneral(list: string[]) {
    const { error } = await supabase.rpc("set_new_client_notify" as any, { _enabled: !!s?.enabled, _emails: list });
    if (error) { toast.error(forbiddenMsg(error.message)); return false; }
    refresh();
    return true;
  }

  async function saveProgram(code: string, list: string[]) {
    const { error } = await supabase.rpc("set_new_client_program_emails" as any, { _program_code: code, _emails: list });
    if (error) { toast.error(forbiddenMsg(error.message)); return false; }
    refresh();
    return true;
  }

  async function test(key: string, programCode: string | null) {
    setTesting(key);
    setResults((r) => ({ ...r, [key]: "" }));
    const { data: id, error } = await supabase.rpc("new_client_notify_test" as any, programCode ? { _program_code: programCode } : {});
    if (error) { setTesting(null); return toast.error(forbiddenMsg(error.message)); }
    let msg = "Sin respuesta todavía. Revisa la bandeja en un minuto.";
    for (let i = 0; i < 15; i++) {
      await sleep(1500);
      const { data } = await supabase.rpc("new_client_notify_test_result" as any, { _request_id: id });
      const r = data as any;
      if (r?.done) {
        let ok = r.status === 200, text = r.body, to: string[] = [];
        try { const b = JSON.parse(r.body); ok = ok && b?.ok !== false; text = b?.error ?? text; to = b?.to ?? []; } catch { /* no JSON */ }
        msg = ok ? `Correo de prueba enviado a ${to.join(", ")}.` : `No se pudo enviar (${r.status}): ${text}`;
        break;
      }
    }
    setResults((r) => ({ ...r, [key]: msg }));
    setTesting(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Aviso de cliente nuevo por correo</CardTitle>
        <CardDescription className="text-xs">
          Cuando una persona se registra en el portal y su primer pago queda aceptado, se manda un correo con su nombre, programa,
          monto y datos de contacto a los correos de <b>su programa</b>. Si un programa no tiene correos propios, se usan los correos generales.
          Se manda una sola vez por cliente. Los asegurados de empresas y torneos no generan aviso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading || !s ? <div className="h-16 rounded bg-muted/40 animate-pulse" /> : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium text-sm">Envío automático</div>
                <div className="text-xs text-muted-foreground">
                  {s.enabled ? "Encendido" : "Apagado: no se manda ningún aviso."} · Últimos 30 días: {s.sent_30d} cliente(s) nuevo(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Switch checked={!!s.enabled} disabled={busy} onCheckedChange={toggle} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {(s.programs ?? []).map((p) => {
                const own = s.emails_by_program?.[p.code] ?? [];
                return (
                  <div key={p.code} className="rounded-md border p-3 space-y-2">
                    <div className="font-medium text-sm">{p.name}</div>
                    <EmailList
                      emails={own}
                      onSave={(list) => saveProgram(p.code, list)}
                      onTest={() => test(p.code, p.code)}
                      testing={testing === p.code}
                      result={results[p.code] || null}
                      emptyHint={s.emails.length ? `Sin correos propios: se manda a los generales (${s.emails.join(", ")}).` : "Sin correos: no le llegará a nadie."}
                    />
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="font-medium text-sm">Correos generales (respaldo)</div>
              <p className="text-xs text-muted-foreground">Se usan solo para los programas que no tienen correos propios.</p>
              <EmailList
                emails={s.emails ?? []}
                onSave={saveGeneral}
                onTest={() => test("general", null)}
                testing={testing === "general"}
                result={results.general || null}
                emptyHint="Sin correos generales."
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
