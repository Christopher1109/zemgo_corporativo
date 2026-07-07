import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock, MessageCircle } from "lucide-react";
import { verifyPortalLogin } from "@/lib/portal/portal.functions";
import { setPortalToken } from "@/lib/portal/portal-token";
import { HopeLogo } from "@/components/hope-logo";

export const Route = createFileRoute("/portal/")({
  component: PortalLanding,
});

const SUPPORT_WHATSAPP_URL = "https://wa.me/525651710563";

// Formato oficial CURP mexicano (18 caracteres alfanuméricos).
const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;

function PortalLanding() {
  const navigate = useNavigate();
  const login = useServerFn(verifyPortalLogin);
  const [curp, setCurp] = useState("");
  const [phone4, setPhone4] = useState("");
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!CURP_REGEX.test(curp)) {
      toast.error("Los datos no coinciden, verifica e intenta de nuevo.");
      return;
    }
    if (!/^\d{4}$/.test(phone4)) {
      toast.error("Los datos no coinciden, verifica e intenta de nuevo.");
      return;
    }
    setLoading(true);
    try {
      const res: any = await login({ data: { curp, phone_last4: phone4 } });
      if (res?.token) setPortalToken(res.token);
      navigate({ to: "/portal/dashboard" });
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("bloqueado_temporalmente")) {
        setBlocked(true);
        toast.error("Acceso temporalmente restringido por seguridad. Intenta más tarde.");
      } else {
        // Mensaje genérico único para no revelar qué campo falló
        toast.error("Los datos no coinciden, verifica e intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-50">
      {/* Brand side */}
      <div className="relative hidden md:flex flex-col justify-between p-10 text-white overflow-hidden bg-[#0a1628]">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
             style={{ background: "radial-gradient(ellipse at top right, #facc15 0%, transparent 60%)" }} />
        <div className="relative z-10 flex items-center gap-4">
          <HopeLogo variant="light" className="h-20 w-auto" />
          <div className="leading-tight">
            <div className="text-2xl font-bold tracking-tight">ZEMGO</div>
            <div className="text-xs uppercase tracking-widest text-slate-300">
              Agente de seguros y fianzas
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-6 max-w-md">
          <h2 className="text-3xl font-light leading-tight">
            Tu seguro,<br />
            <span className="text-yellow-400 font-semibold">siempre a la mano.</span>
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Consulta tu certificado, descárgalo, paga tu seguro y reporta un siniestro
            desde cualquier dispositivo, las 24 horas.
          </p>
          <div className="flex gap-6 pt-4 text-xs text-slate-400">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400" /> Datos protegidos</div>
            <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-yellow-400" /> Acceso seguro</div>
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} ZEMGO · Portal del Asegurado
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* mobile-only header */}
          <div className="md:hidden mb-6 flex flex-col items-center text-center">
            <div className="rounded-xl bg-[#0a1628] px-5 py-4 mb-3 flex items-center gap-3">
              <HopeLogo variant="light" className="h-12 w-auto" />
              <div className="text-left leading-tight text-white">
                <div className="text-base font-bold">ZEMGO</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-300">
                  Agente de seguros y fianzas
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Portal del Asegurado</h1>
            <p className="mt-2 text-sm text-slate-600">
              Ingresa tu CURP y los últimos 4 dígitos del teléfono con el que te registraste.
            </p>
          </div>

          {blocked ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Acceso temporalmente restringido por seguridad. Intenta más tarde.
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="curp">CURP</Label>
              <Input
                id="curp"
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 18))}
                placeholder="18 caracteres"
                maxLength={18}
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone4">Últimos 4 dígitos del teléfono</Label>
              <Input
                id="phone4"
                value={phone4}
                onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                className="font-mono tracking-widest text-center"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white"
              disabled={loading || blocked}
            >
              {loading ? "Validando…" : "Ingresar"}
            </Button>
          </form>

          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <MessageCircle className="h-4 w-4 text-green-600" />
            Contactar soporte por WhatsApp
          </a>

          <p className="mt-6 text-center text-xs text-slate-400">
            <Link to="/auth" className="hover:underline">
              Acceso para personal ZEMGO
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
