import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Share, MoreVertical, PlusSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";

// Evento de Chrome/Android que permite instalar la app con un botón.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return deferredPrompt;
}

export function InstallShortcutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const prompt = useInstallPrompt();
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [standalone, setStandalone] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : "/dashboard";

  useEffect(() => {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
  }, [open]);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      toast.success("Acceso directo creado");
      onOpenChange(false);
    }
    deferredPrompt = null;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5" style={{ color: "var(--program-primary, #0f2a4a)" }} /> Acceso directo al celular
          </DialogTitle>
          <DialogDescription>
            Crea un ícono de ZEMGO en la pantalla de inicio. Se abre como app, sin barra del navegador, y solo pide
            usuario y contraseña la primera vez.
          </DialogDescription>
        </DialogHeader>

        {standalone ? (
          <p className="text-sm rounded-md bg-muted p-3">Ya estás usando el acceso directo. 👍</p>
        ) : prompt ? (
          <Button onClick={install} className="w-full" size="lg">
            Agregar a la pantalla de inicio
          </Button>
        ) : platform === "ios" ? (
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="font-mono font-semibold">1</span><span>Abre esta página en <strong>Safari</strong>.</span></li>
            <li className="flex gap-3"><span className="font-mono font-semibold">2</span><span className="flex flex-wrap items-center gap-1">Toca <Share className="size-4 inline" /> <strong>Compartir</strong> (abajo al centro).</span></li>
            <li className="flex gap-3"><span className="font-mono font-semibold">3</span><span className="flex flex-wrap items-center gap-1">Elige <PlusSquare className="size-4 inline" /> <strong>Agregar a inicio</strong> y confirma.</span></li>
          </ol>
        ) : platform === "android" ? (
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="font-mono font-semibold">1</span><span>Abre esta página en <strong>Chrome</strong>.</span></li>
            <li className="flex gap-3"><span className="font-mono font-semibold">2</span><span className="flex flex-wrap items-center gap-1">Toca el menú <MoreVertical className="size-4 inline" /> (arriba a la derecha).</span></li>
            <li className="flex gap-3"><span className="font-mono font-semibold">3</span><span>Elige <strong>Agregar a la pantalla principal</strong> o <strong>Instalar app</strong>.</span></li>
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Abre este enlace desde el celular (Safari en iPhone o Chrome en Android), inicia sesión y vuelve a este
            botón para crear el acceso directo.
          </p>
        )}

        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">Enlace directo al sistema</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{link}</code>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar enlace">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
