import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, User } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listWhatsappConversations,
  listWhatsappThread,
  sendWhatsappMessage,
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

function MessagesPage() {
  const listFn = useServerFn(listWhatsappConversations);
  const threadFn = useServerFn(listWhatsappThread);
  const sendFn = useServerFn(sendWhatsappMessage);
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: conversations, isLoading: loadingList } = useQuery({
    queryKey: ["whatsapp", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000, // "casi en vivo" sin necesidad de websockets
  });

  const { data: thread, isLoading: loadingThread } = useQuery({
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

  const selectedConv = conversations?.find((c) => c.wa_phone === selected);

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
            <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Todavía no hay mensajes registrados.</div>
          ) : (
            conversations.map((c) => (
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
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatTime(c.last_at)}
                  </span>
                </div>
                {c.client_name && (
                  <div className="text-[11px] text-muted-foreground">{formatPhone(c.wa_phone)}</div>
                )}
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.last_direction === "outbound" ? "Tú: " : ""}
                  {c.last_body || "—"}
                </div>
              </button>
            ))
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
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-sm">
                    {selectedConv?.client_name || formatPhone(selected)}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatPhone(selected)}</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {loadingThread ? (
                  <div className="text-sm text-muted-foreground">Cargando…</div>
                ) : (
                  (thread ?? []).map((m: any) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                          m.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-background border rounded-bl-sm"
                        }`}
                      >
                        <div>{m.body || `[${m.message_type}]`}</div>
                        <div
                          className={`text-[10px] mt-1 ${
                            m.direction === "outbound" ? "opacity-70" : "text-muted-foreground"
                          }`}
                        >
                          {m.sent_by ? (m.profiles?.full_name ?? "Equipo") : m.direction === "outbound" ? "Bot" : ""}
                          {" · "}
                          {formatTime(m.created_at)}
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
