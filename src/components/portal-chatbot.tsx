import { useState } from "react";
import { MessageCircle, X, ChevronRight, ArrowLeft } from "lucide-react";
import { PORTAL_FAQ, type FaqItem } from "@/data/portal-faq";

export function PortalChatbot() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FaqItem | null>(null);

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar ayuda" : "Abrir ayuda"}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-slate-900 shadow-lg shadow-yellow-500/40 hover:scale-105 transition"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 md:bottom-24 md:right-6 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded p-1 hover:bg-white/10"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex-1">
              <div className="text-sm font-semibold">Ayuda ZEMGO</div>
              <div className="text-[11px] text-slate-300">
                {selected ? "Respuesta" : "¿En qué te podemos ayudar?"}
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!selected ? (
              <ul className="divide-y">
                {PORTAL_FAQ.map((item, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setSelected(item)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="text-slate-800">{item.q}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 space-y-3 text-sm">
                <div className="font-semibold text-slate-900">{selected.q}</div>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                  {selected.a}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            ¿No encuentras lo que buscas? Contáctanos desde tu certificado.
          </div>
        </div>
      )}
    </>
  );
}
