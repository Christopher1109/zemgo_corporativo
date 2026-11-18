import { useEffect, useState } from "react";
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

/** Aviso por correo al equipo cuando un cliente nuevo hace su primer pago. */
export function NewClientEmailCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["new-client-notify-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("new_client_notify_status" as any);
      if (error) throw error;
      return data as { enabled: boolean; emails: string[]; sent_30d: number };
    },
  });
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { if (q.data) setEmails(q.data.emails ?? []); }, [q.data]);

  async function save(enabled: boolean, list: string[]) {
    setBusy(true);
    const { error } = await supabase.rpc("set_new_client_notify" as any, { _enabled: enabled, _emails: list });
    setBusy(false);
    if (error) { toast.error(error.message === "forbidden" ? "Solo un administrador puede cambiar esto." : error.message); return false; }
    qc.invalidateQueries({ queryKey: ["new-client-notify-status"] });
    return true;
  }

  async function add() {
    const e = draft.trim().toLowerCase();
    if (!isEmail(e)) return toast.error("Escribe un correo válido.");
    if (emails.includes(e)) return setDraft("");
    const list = [...emails, e];
    if (await save(!!q.data?.enabled, list)) { setDraft(""); toast.success("Correo agregado."); }
  }

  async function remove(e: string) {
    if (await save(!!q.data?.enabled, emails.filter((x) => x !== e))) toast.success("Correo quitado.");
  }

  async function toggle(v: boolean) {
    if (await save(v, emails)) toast.success(v ? "Aviso de cliente nuevo encendido." : "Aviso de cliente nuevo apagado.");
  }

  async function test() {
    if (!emails.length) return toast.error("Agrega al menos un correo.");
    setTesting(true); setResult(null);
    const { data: id, error } = await supabase.rpc("new_client_notify_test" as any);
    if (error) { setTesting(false); return toast.error(error.message === "forbidden" ? "Solo un administrador puede mandar pruebas." : error.message); }
    for (let i = 0; i < 15; i++) {
      await sleep(1500);
      const { data } = await supabase.rpc("new_client_notify_test_result" as any, { _request_id: id });
      const r = data as any;
      if (r?.done) {
        let ok = r.status === 200, msg = r.body;
        try { const b = JSON.parse(r.body); ok = ok && b?.ok !== false; msg = b?.error ?? msg; } catch { /* no JSON */ }
        setResult(ok ? `Correo de prueba enviado a ${emails.join(", ")}.` : `No se pudo enviar (${r.status}): ${msg}`);
        setTesting(false);
        return;
      }
    }
    setTesting(false);
    setResult("Sin respuesta todavía. Revisa la bandeja en un minuto.");
  }

  const s = q.data;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Aviso de cliente nuevo por correo</CardTitle>
        <CardDescription className="text-xs">
          Cuando una persona se registra en el portal y su primer pago queda aceptado, se manda un correo a estas direcciones
          con su nombre, programa, monto y datos de contacto. Se manda una sola vez por cliente. Los asegurados de empresas y torneos no generan aviso.
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
            <div className="space-y-2">
              <div className="font-medium text-sm">Correos que reciben el aviso</div>
              {emails.length === 0 && <p className="text-xs text-rose-700">Todavía no hay correos: el aviso no le llegará a nadie.</p>}
              <div className="flex flex-wrap gap-2">
                {emails.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                    {e}
                    <button type="button" onClick={() => remove(e)} disabled={busy} className="text-muted-foreground hover:text-foreground" aria-label={`Quitar ${e}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form className="flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); add(); }}>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="nombre@semgo.mx" className="w-[260px]" type="email" />
                <Button type="submit" variant="outline" disabled={busy}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
                <Button type="button" onClick={test} disabled={testing || !emails.length}>
                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Mandar correo de prueba
                </Button>
              </form>
              {result && <p className="text-sm">{result}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
