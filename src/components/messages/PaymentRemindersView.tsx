import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Bot, CheckCircle2, MessageCircle, Search, User, XCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listPaymentReminderLog,
  listWhatsappThread,
  type PaymentReminderLogRow,
} from "@/lib/whatsapp-messages.functions";

type Outcome = "paid" | "already_paid" | "replied" | "no_reply" | "failed" | "queued" | "discarded";

const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  paid: { label: "Pagó", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  already_paid: { label: "Ya había pagado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  replied: { label: "Respondió", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  no_reply: { label: "Sin respuesta", cls: "bg-muted text-muted-foreground" },
  failed: { label: "No se pudo enviar", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  queued: { label: "En cola", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  discarded: { label: "Descartado", cls: "bg-muted text-muted-foreground" },
};

export function outcomeOf(r: PaymentReminderLogRow): Outcome {
  if (r.status === "failed") return "failed";
  if (r.status === "pending" || r.status === "queued") return "queued";
  if (r.status !== "sent") return "discarded";
  const sentAt = r.sent_at ?? r.created_at;
  if (r.payment_status === "paid") return r.paid_at && r.paid_at < sentAt ? "already_paid" : "paid";
  if ((r.replies ?? 0) > 0) return "replied";
  return "no_reply";
}

const fmtMoney = (n: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`);
const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d: string) => new Date(d).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = (d: string) => new Date(d).toLocaleDateString("en-CA");
const dayLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
function formatPhone(p: string | null) {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10).replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3") : p ?? "—";
}

function summarize(rows: PaymentReminderLogRow[]) {
  const s = { sent: 0, paid: 0, replied: 0, no_reply: 0, failed: 0 };
  for (const r of rows) {
    const o = outcomeOf(r);
    if (r.status === "sent") s.sent++;
    if (o === "paid" || o === "already_paid") s.paid++;
    else if (o === "replied") s.replied++;
    else if (o === "no_reply") s.no_reply++;
    else if (o === "failed") s.failed++;
  }
  return s;
}

export function PaymentRemindersView({ programCode, programName, onOpenConversation }: {
  programCode: string;
  programName: string;
  onOpenConversation: (waPhone: string) => void;
}) {
  const logFn = useServerFn(listPaymentReminderLog);
  const threadFn = useServerFn(listWhatsappThread);
  const [days, setDays] = useState("30");
  const [filter, setFilter] = useState<"all" | Outcome>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["whatsapp", "reminder-log", programCode, days],
    queryFn: () => logFn({ data: { program_code: programCode, days: Number(days) } }),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((r) => {
      const o = outcomeOf(r);
      if (filter !== "all" && !(o === filter || (filter === "paid" && o === "already_paid"))) return false;
      if (!needle) return true;
      return `${r.client_name ?? ""} ${r.phone ?? ""} ${r.folio ?? ""}`.toLowerCase().includes(needle);
    });
  }, [data, filter, q]);

  const groups = useMemo(() => {
    const m = new Map<string, PaymentReminderLogRow[]>();
    for (const r of rows) {
      const k = dayKey(r.sent_at ?? r.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const total = summarize(data);
  const selected = data.find((r) => r.id === selectedId) ?? null;

  const { data: thread = [], isLoading: loadingThread } = useQuery({
    queryKey: ["whatsapp", "thread", selected?.wa_phone],
    queryFn: () => threadFn({ data: { wa_phone: selected!.wa_phone! } }),
    enabled: !!selected?.wa_phone,
    refetchInterval: selected?.wa_phone ? 10_000 : false,
  });
  // La conversación se muestra a partir del recordatorio (con un poco de contexto previo).
  const fromAt = selected ? new Date(new Date(selected.sent_at ?? selected.created_at).getTime() - 60_000).toISOString() : "";
  const visibleThread = thread.filter((m) => m.created_at >= fromAt);

  const chips: { key: "all" | Outcome; label: string; n: number }[] = [
    { key: "all", label: "Todos", n: data.length },
    { key: "paid", label: "Pagaron", n: total.paid },
    { key: "replied", label: "Respondieron", n: total.replied },
    { key: "no_reply", label: "Sin respuesta", n: total.no_reply },
    { key: "failed", label: "No enviados", n: total.failed },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
        {[
          { l: "Enviados", v: total.sent, c: "" },
          { l: "Pagaron", v: total.paid, c: "text-emerald-700" },
          { l: "Respondieron", v: total.replied, c: "text-sky-700" },
          { l: "Sin respuesta", v: total.no_reply, c: "text-muted-foreground" },
          { l: "No se pudieron enviar", v: total.failed, c: "text-rose-700" },
        ].map((x) => (
          <Card key={x.l} className="p-3">
            <div className="text-[11px] uppercase text-muted-foreground">{x.l}</div>
            <div className={`text-xl font-semibold tabular-nums ${x.c}`}>{x.v}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Button key={c.key} size="sm" variant={filter === c.key ? "default" : "outline"} onClick={() => setFilter(c.key)}>
            {c.label} <span className="ml-1.5 text-[11px] opacity-70">{c.n}</span>
          </Button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, número o folio" className="h-9 pl-8 w-[230px]" />
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
            <SelectItem value="365">Último año</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="flex-1 min-h-[420px] flex overflow-hidden">
        <div className="w-[380px] shrink-0 border-r overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Cargando recordatorios…</div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">No se pudo cargar: {String((error as any)?.message ?? "error")}</div>
          ) : groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {data.length === 0
                ? `Todavía no se han mandado recordatorios de pago de ${programName} en este periodo. Aparecerán aquí cuando el envío automático esté encendido (Configuración → Alertas) o cuando alguien reenvíe uno desde Alertas.`
                : "Ningún recordatorio coincide con el filtro."}
            </div>
          ) : (
            groups.map(([k, list]) => {
              const s = summarize(list);
              return (
                <div key={k}>
                  <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur px-4 py-2 border-b">
                    <div className="text-xs font-medium capitalize">{dayLabel(k)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.sent} enviados · {s.paid} pagaron · {s.replied} respondieron · {s.no_reply} sin respuesta{s.failed ? ` · ${s.failed} no enviados` : ""}
                    </div>
                  </div>
                  {list.map((r) => {
                    const o = OUTCOME[outcomeOf(r)];
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition ${selectedId === r.id ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{r.client_name ?? "Cliente sin identificar"}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${o.cls}`}>{o.label}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                          <span>{formatPhone(r.phone)}</span>
                          <span>{fmtMoney(r.amount)} · vence {fmtDate(r.due_date)}</span>
                          <span className="inline-flex items-center gap-0.5">
                            {r.manual ? <><User className="h-2.5 w-2.5" /> {r.sent_by_name ?? "Equipo"}</> : <><Bot className="h-2.5 w-2.5" /> Automático</>}
                          </span>
                        </div>
                        {r.status === "sent" && r.last_reply?.body && (
                          <div className="text-xs text-muted-foreground truncate mt-1">Cliente: “{r.last_reply.body}”</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Selecciona un recordatorio para ver a quién se le mandó, qué contestó y en qué quedó.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold">{selected.client_name ?? "Cliente sin identificar"}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>{formatPhone(selected.phone)}</span>
                      {selected.folio && <span className="font-mono">{selected.folio}</span>}
                      <span>Enviado {fmtDateTime(selected.sent_at ?? selected.created_at)} · {selected.manual ? `por ${selected.sent_by_name ?? "el equipo"}` : "automático"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selected.client_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/clients/$clientId" params={{ clientId: selected.client_id }}>Ver cliente</Link>
                      </Button>
                    )}
                    {selected.wa_phone && (
                      <Button size="sm" onClick={() => onOpenConversation(selected.wa_phone!)}>
                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Responder
                      </Button>
                    )}
                  </div>
                </div>
                <ResultBox r={selected} />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {!selected.wa_phone ? (
                  <div className="text-sm text-muted-foreground">Este recordatorio no tiene un número válido.</div>
                ) : loadingThread ? (
                  <div className="text-sm text-muted-foreground">Cargando conversación…</div>
                ) : visibleThread.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {selected.status === "sent" ? "El cliente no ha escrito después del recordatorio." : "Este recordatorio no se envió, no hay conversación."}
                  </div>
                ) : (
                  visibleThread.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        m.message_type === "template"
                          ? "bg-amber-50 border border-amber-200 text-amber-950 rounded-br-sm"
                          : m.direction === "outbound" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-background border rounded-bl-sm"}`}>
                        <div>{m.body || `[${m.message_type}]`}</div>
                        <div className="text-[10px] mt-1 opacity-75 flex items-center gap-1 justify-end">
                          {m.direction === "outbound" && (m.sent_by ? <><User className="h-2.5 w-2.5" /> {m.sent_by_name ?? "Equipo"}</> : <><Bot className="h-2.5 w-2.5" /> Bot</>)}
                          <span>{fmtDateTime(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResultBox({ r }: { r: PaymentReminderLogRow }) {
  const o = outcomeOf(r);
  const icon = o === "paid" || o === "already_paid" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : o === "failed" ? <XCircle className="h-4 w-4 text-rose-600" />
    : o === "replied" ? <MessageCircle className="h-4 w-4 text-sky-600" />
    : o === "queued" ? <Clock className="h-4 w-4 text-amber-600" />
    : <Bell className="h-4 w-4 text-muted-foreground" />;
  const text =
    o === "paid" ? `Pagó ${fmtMoney(r.amount)} el ${fmtDate(r.paid_at)} después del recordatorio.`
    : o === "already_paid" ? `Ya había pagado el ${fmtDate(r.paid_at)} antes del recordatorio.`
    : o === "replied" ? `Respondió ${r.replies} ${r.replies === 1 ? "mensaje" : "mensajes"}; el pago de ${fmtMoney(r.amount)} sigue ${r.payment_status === "overdue" ? "vencido" : "pendiente"} (vence ${fmtDate(r.due_date)}).`
    : o === "no_reply" ? `No ha respondido y el pago de ${fmtMoney(r.amount)} sigue ${r.payment_status === "overdue" ? "vencido" : "pendiente"} (vence ${fmtDate(r.due_date)}).`
    : o === "failed" ? "WhatsApp no aceptó el envío (número inválido, sin WhatsApp o error de la línea). Conviene contactarlo por otro medio."
    : o === "queued" ? "Está en cola para el próximo envío."
    : "Se descartó (aviso atrasado).";
  return (
    <div className="rounded-md border bg-background p-2.5 text-sm flex items-start gap-2">
      {icon}
      <div><span className="font-medium">En qué quedó: </span>{text}</div>
    </div>
  );
}
