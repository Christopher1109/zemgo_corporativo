import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, User, Bot, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  listWhatsappConversations,
  listWhatsappThread,
  sendWhatsappMessage,
  resumeWhatsappBot,
} from "@/lib/whatsapp-messages.functions";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Mensajes — ZEMGO" }] }),
  component: MessagesPage,
});

function formatPhone(waPhone: string): string {
  const digits = waPhone.replace(/[^\d]/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  return cc ? `+${cc} ${local}` : local;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isPaused(bot_paused_until: string | null): boolean {
  return !!bot_paused_until && new Date(bot_paused_until).getTime() > Date.now();
}

const PROGRAM_LABEL: Record<string, string> = {
  ABC: "ABC de Protección",
  FUTCARE: "FutCare",
  MCV: "Manos con Valor",
};

function MessagesPage() {
  const listFn = useServerFn(listWhatsappConversations);
  const threadFn = useServerFn(listWhatsappThread);
  const sendFn = useServerFn(sendWhatsappMessage);
  const resumeFn = useServerFn(resumeWhatsappBot);
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const {
    data: conversations,
    isLoading: loadingList,
    isError: listError,
    error: listErrorObj,
  } = useQuery({
    queryKey: ["whatsapp", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000, // "casi en vivo" sin necesidad de websockets
  });

  const {
    data: thread,
    isLoading: loadingThread,
    isError: threadError,
    error: threadErrorObj,
  } = useQuery({
    queryKey: ["whatsapp", "thread", selected],
    queryFn: () => threadFn({ data: { wa_phone: selected! } }),
    enabled: !!selected,
    refetchInterval: selected ? 8_000 : false,
  });

  useEffect(() => {
    if (!selected && conversations && conversations.length > 0) {
      setSelected(conversations[0].wa_phone);
    }
  }, [conversations, selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      await sendFn({ data: { to: selected, body: draft.trim() } });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["whatsapp", "thread", selected] });
      qc.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("envio_fallido") || msg.includes("24")) {
        toast.error(
          "No se pudo enviar: probablemente pasaron más de 24h desde el último mensaje del cliente. WhatsApp solo permite responder libremente dentro de esa ventana.",
        );
      } else {
        toast.error(`No se pudo enviar el mensaje: ${msg || "error desconocido"}`);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleResumeBot() {
    if (!selected) return;
    try {
      await resumeFn({ data: { wa_phone: selected } });
      qc.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
      toast.success("El bot vuelve a responder automáticamente a este número.");
    } catch (err: any) {
      toast.error(`No se pudo reactivar el bot: ${err?.message ?? "error"}`);
    }
  }

  const selectedConv = conversations?.find((c) => c.wa_phone === selected);
  const selectedPaused = isPaused(selectedConv?.bot_paused_until ?? null);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6" />
          Mensajes de WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historial de conversaciones del bot y del equipo. Puedes responder manualmente dentro de las 24h
          posteriores al último mensaje del cliente.
        </p>
      </div>

      <Card className="flex-1 min-h-0 flex overflow-hidden">
        {/* Lista de conversaciones */}
        <div className="w-80 shrink-0 border-r overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-sm text-muted-foreground">Cargando conversaciones…</div>
          ) : listError ? (
            <div className="p-4 text-sm text-destructive">
              No se pudo cargar el historial: {String((listErrorObj as any)?.message ?? "error desconocido")}
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Todavía no hay mensajes registrados.</div>
          ) : (
            conversations.map((c) => {
              const paused = isPaused(c.bot_paused_until);
              return (
                <button
                  key={c.wa_phone}
                  onClick={() => setSelected(c.wa_phone)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition ${
                    selected === c.wa_phone ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {c.client_name || formatPhone(c.wa_phone)}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(c.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {c.client_name && (
                      <span className="text-[11px] text-muted-foreground">{formatPhone(c.wa_phone)}</span>
                    )}
                    {c.program_code && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {PROGRAM_LABEL[c.program_code] ?? c.program_code}
                      </Badge>
                    )}
                    {paused && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                        <User className="h-2.5 w-2.5" /> humano
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {c.last_direction === "outbound" ? "Tú: " : ""}
                    {c.last_body || "—"}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Hilo de conversación */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecciona una conversación
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {selectedConv?.client_name || formatPhone(selected)}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <span>{formatPhone(selected)}</span>
                      {selectedConv?.program_code && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {PROGRAM_LABEL[selectedConv.program_code] ?? selectedConv.program_code}
                          {selectedConv.program_status ? ` · ${selectedConv.program_status}` : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {selectedPaused && (
                  <Button variant="outline" size="sm" onClick={handleResumeBot} className="shrink-0 gap-1.5">
                    <PlayCircle className="h-3.5 w-3.5" />
                    Reactivar bot
                  </Button>
                )}
              </div>

              {selectedPaused && (
                <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  El bot está en pausa para este número — un humano está atendiendo (o el cliente lo pidió).
                  No va a contestar automáticamente hasta que lo reactives o el cliente escriba "menu".
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {loadingThread ? (
                  <div className="text-sm text-muted-foreground">Cargando mensajes…</div>
                ) : threadError ? (
                  <div className="text-sm text-destructive">
                    No se pudo cargar la conversación: {String((threadErrorObj as any)?.message ?? "error desconocido")}
                  </div>
                ) : !thread || thread.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin mensajes todavía.</div>
                ) : (
                  thread.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          m.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-background border rounded-bl-sm"
                        }`}
                      >
                        <div>{m.body || `[${m.message_type}]`}</div>
                        <div
                          className={`text-[10px] mt-1 flex items-center gap-1 ${
                            m.direction === "outbound" ? "opacity-75 justify-end" : "text-muted-foreground"
                          }`}
                        >
                          {m.direction === "outbound" &&
                            (m.sent_by ? (
                              <>
                                <User className="h-2.5 w-2.5" /> {m.sent_by_name ?? "Equipo"}
                              </>
                            ) : (
                              <>
                                <Bot className="h-2.5 w-2.5" /> Bot
                              </>
                            ))}
                          <span>{formatTime(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSend} className="border-t p-3 flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe tu respuesta…"
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e as unknown as React.FormEvent);
                    }
                  }}
                />
                <Button type="submit" disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
