import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HopeLogo } from "@/components/hope-logo";
import { verifyPortalCode, requestPortalAccess } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/portal/verify")({
  component: VerifyPage,
});

type Pending = { client_id: string; first_name: string; dev_code: string | null };

function VerifyPage() {
  const navigate = useNavigate();
  const verify = useServerFn(verifyPortalCode);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _resend = useServerFn(requestPortalAccess);
  const [pending, setPending] = useState<Pending | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    const raw = sessionStorage.getItem("portal.pending");
    if (!raw) {
      navigate({ to: "/portal" });
      return;
    }
    setPending(JSON.parse(raw));
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      e.preventDefault();
      setDigits(text.split(""));
      refs.current[5]?.focus();
    }
  }

  async function onVerify() {
    if (!pending) return;
    const code = digits.join("");
    if (code.length !== 6) return toast.error("Ingresa los 6 dígitos");
    setLoading(true);
    try {
      await verify({ data: { client_id: pending.client_id, code } });
      sessionStorage.removeItem("portal.pending");
      navigate({ to: "/portal/dashboard" });
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("codigo_incorrecto")) toast.error("Código incorrecto");
      else if (msg.includes("bloqueado_temporalmente")) toast.error("Bloqueado por 15 minutos. Intenta más tarde.");
      else if (msg.includes("codigo_no_valido")) toast.error("Código expirado. Solicita uno nuevo.");
      else toast.error("No fue posible verificar el código");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!pending || cooldown > 0) return;
    toast.message("Por seguridad, vuelve a ingresar tu CURP para reenviar.");
    navigate({ to: "/portal" });
  }

  if (!pending) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-xl bg-slate-900 px-5 py-3 mb-3">
            <HopeLogo variant="light" className="h-9 w-auto" />
          </div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Portal del Asegurado</p>
        </div>

        {pending.dev_code ? (
          <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm">
            <div className="font-semibold text-yellow-900">MODO QA</div>
            <div className="mt-1 text-yellow-800">
              Tu código es <span className="font-mono text-lg font-bold">{pending.dev_code}</span>
            </div>
            <div className="mt-1 text-xs text-yellow-700">
              Este banner solo aparece en modo de pruebas. En producción el código llegará por WhatsApp.
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Hola, {pending.first_name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Te enviamos un código de verificación. Ingrésalo abajo.
          </p>

          <div className="mt-6 flex justify-between gap-2" onPaste={onPaste}>
            {digits.map((d, i) => (
              <Input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
                }}
                inputMode="numeric"
                maxLength={1}
                className="h-14 w-12 text-center text-xl font-bold"
              />
            ))}
          </div>

          <Button
            onClick={onVerify}
            disabled={loading}
            className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white"
          >
            {loading ? "Verificando…" : "Verificar"}
          </Button>

          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0}
            className="mt-4 w-full text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            {cooldown > 0 ? `Reenviar código en ${cooldown}s` : "Reenviar código"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link to="/portal" className="hover:underline">Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
