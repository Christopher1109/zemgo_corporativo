import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Encender / apagar los recordatorios automáticos de pago por WhatsApp y mandar una prueba. */
export function WhatsAppRemindersCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["whatsapp-reminders-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("whatsapp_reminders_status" as any);
      if (error) throw error;
      return data as any;
    },
  });
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [program, setProgram] = useState("ABC");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const s = q.data;

  async function toggle(v: boolean) {
    if (v && !window.confirm("Se encenderán los recordatorios automáticos: cada día a las 10:00 a.m. se mandará WhatsApp a los clientes cuyo pago vence en los días configurados. ¿Continuar?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_whatsapp_reminders_enabled" as any, { _enabled: v });
    setBusy(false);
    if (error) return toast.error(error.message === "forbidden" ? "Solo un administrador puede cambiar esto." : error.message);
    toast.success(v ? `Recordatorios por WhatsApp encendidos${(data as any)?.stale_cancelled ? ` (${(data as any).stale_cancelled} avisos atrasados descartados)` : ""}.` : "Recordatorios por WhatsApp apagados.");
    qc.invalidateQueries({ queryKey: ["whatsapp-reminders-status"] });
  }

  async function test() {
    if (to.replace(/\D/g, "").length < 10) return toast.error("Escribe un celular de 10 dígitos.");
    setTesting(true); setResult(null);
    const { data: id, error } = await supabase.rpc("whatsapp_test_send" as any, { _to: to, _program_code: program });
    if (error) { setTesting(false); return toast.error(error.message === "forbidden" ? "Solo un administrador puede mandar pruebas." : error.message); }
    for (let i = 0; i < 15; i++) {
      await sleep(1500);
      const { data } = await supabase.rpc("whatsapp_test_result" as any, { _request_id: id });
      if ((data as any)?.done) {
        const r = data as any;
        let ok = r.status === 200;
        try { ok = ok && JSON.parse(r.body)?.ok !== false; } catch { /* cuerpo no JSON */ }
        setResult(ok ? "Mensaje enviado. Revisa el WhatsApp de ese número." : `No se pudo enviar (${r.status}): ${r.body}`);
        setTesting(false);
        return;
      }
    }
    setTesting(false);
    setResult("Sin respuesta todavía. Revisa el WhatsApp en un minuto.");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Recordatorios de pago por WhatsApp</CardTitle>
        <CardDescription className="text-xs">
          Cada día a las 10:00 a.m. se manda la plantilla <code>payment_reminder</code> a los clientes individuales cuyo pago vence en los días indicados por programa.
          Los asegurados de empresas no reciben recordatorios (paga la empresa).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading || !s ? <div className="h-16 rounded bg-muted/40 animate-pulse" /> : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium text-sm">Envío automático</div>
                <div className="text-xs text-muted-foreground">
                  {s.enabled ? "Encendido" : "Apagado: no se manda ningún recordatorio automático (el botón de reenvío manual en Alertas sí funciona)."}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Switch checked={!!s.enabled} disabled={busy} onCheckedChange={toggle} />
              </div>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {(s.programs ?? []).map((p: any) => {
                const line = (s.lines ?? []).find((l: any) => l.program_code === p.code);
                return (
                  <div key={p.code} className="rounded-md border p-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-muted-foreground">{p.offset_days} días antes del vencimiento</div>
                    {line?.configured
                      ? <Badge variant="outline" className="mt-1 bg-emerald-50 text-emerald-800 border-emerald-200">Línea configurada</Badge>
                      : <Badge variant="outline" className="mt-1 bg-rose-50 text-rose-800 border-rose-200">Sin línea de WhatsApp</Badge>}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              Próximos 7 días: {s.next_7d} recordatorio(s) por enviar{s.next_7d_sin_telefono ? `, ${s.next_7d_sin_telefono} sin teléfono (no se podrán mandar)` : ""} ·
              Últimos 30 días: {s.queue?.sent_30d ?? 0} enviados, {s.queue?.failed_30d ?? 0} fallidos
              {s.last_run ? ` · Última corrida: ${new Date(s.last_run.at).toLocaleString("es-MX")}` : ""}
            </div>
          </>
        )}
        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium text-sm">Mandar mensaje de prueba</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Celular (10 dígitos)</Label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="8112345678" className="w-[170px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Línea del programa</Label>
              <Select value={program} onValueChange={setProgram}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(s?.lines ?? []).filter((l: any) => l.configured).map((l: any) => <SelectItem key={l.program_code} value={l.program_code}>{l.program_code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Mandar prueba
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Llega como "Prueba", monto $100 y vencimiento en 5 días. Funciona aunque el envío automático esté apagado.</p>
          {result && <p className="text-sm">{result}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
