import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectPlatform() {
  if (typeof window === "undefined") return "other" as const;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true;
  return { isIOS, isAndroid, isStandalone };
}

export function PortalInstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPlatform>>(
    { isIOS: false, isAndroid: false, isStandalone: false } as any,
  );

  useEffect(() => {
    setPlatform(detectPlatform() as any);
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Ya instalado: no mostrar
  if ((platform as any).isStandalone) return null;

  async function onClick() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    if ((platform as any).isIOS) {
      setShowIOS(true);
      return;
    }
    // Escritorio u otro sin prompt disponible
    setShowIOS(true);
  }

  return (
    <>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow hover:bg-yellow-300 transition"
      >
        <Download className="h-4 w-4" />
        Crear acceso directo
      </button>

      {showIOS && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4"
          onClick={() => setShowIOS(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-3">
              <div className="text-sm font-semibold">Agregar acceso directo</div>
              <button onClick={() => setShowIOS(false)} className="rounded p-1 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-slate-700">
              {(platform as any).isIOS ? (
                <>
                  <p>
                    Para instalar el portal en tu iPhone/iPad:
                  </p>
                  <ol className="space-y-3">
                    <li className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs">1</span>
                      <span className="flex-1">
                        Toca el botón <Share className="inline h-4 w-4 -mt-0.5" /> <b>Compartir</b> en la barra inferior de Safari.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs">2</span>
                      <span className="flex-1">
                        Baja y selecciona <b>Agregar a pantalla de inicio</b> <Plus className="inline h-4 w-4 -mt-0.5" />.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs">3</span>
                      <span className="flex-1">
                        Toca <b>Agregar</b> en la esquina superior derecha.
                      </span>
                    </li>
                  </ol>
                  <p className="text-xs text-slate-500">
                    Debe abrirse en Safari (no en Chrome ni en la vista dentro de otra app).
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Tu navegador no ofrece instalación con un toque. Puedes hacerlo manualmente:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>En Chrome/Edge de escritorio: menú ⋮ → <b>Instalar aplicación</b>.</li>
                    <li>En Android: menú ⋮ → <b>Agregar a pantalla de inicio</b>.</li>
                  </ul>
                  <p className="text-xs text-slate-500">
                    Si no ves la opción, abre el portal en la versión publicada desde tu navegador.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
