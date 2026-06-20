import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock } from "lucide-react";
import { requestPortalAccess } from "@/lib/portal/portal.functions";
import { HopeLogo } from "@/components/hope-logo";

export const Route = createFileRoute("/portal/")({
  component: PortalLanding,
});

function PortalLanding() {
  const navigate = useNavigate();
  const request = useServerFn(requestPortalAccess);
  const [curp, setCurp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (curp.length !== 18) {
      toast.error("CURP debe tener 18 caracteres");
      return;
    }
    if (name.trim().length < 3) {
      toast.error("Ingresa tu nombre completo");
      return;
    }
    setLoading(true);
    try {
      const res = await request({ data: { curp, full_name: name } });
      sessionStorage.setItem(
        "portal.pending",
        JSON.stringify({ client_id: res.client_id, first_name: res.first_name, dev_code: res.dev_code }),
      );
      navigate({ to: "/portal/verify" });
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("cliente_no_encontrado")) {
        toast.error("No encontramos tu registro. Verifica los datos o contacta soporte.");
      } else if (msg.includes("datos_no_coinciden")) {
        toast.error("Los datos no coinciden. Verifica e intenta de nuevo.");
      } else if (msg.includes("demasiados_intentos")) {
        toast.error("Demasiados intentos. Espera unos minutos.");
      } else if (msg.includes("curp_invalido")) {
        toast.error("CURP inválido.");
      } else {
        toast.error("No fue posible procesar tu solicitud.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-50">
      {/* Brand side */}
      <div className="relative hidden md:flex flex-col justify-between p-10 bg-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
             style={{ background: "radial-gradient(ellipse at top right, #facc15 0%, transparent 60%)" }} />
        <div className="relative z-10">
          <HopeLogo variant="light" className="h-14 w-auto" />
        </div>
        <div className="relative z-10 space-y-6 max-w-md">
          <h2 className="text-3xl font-light leading-tight">
            Tu seguro,<br />
            <span className="text-yellow-400 font-semibold">siempre a la mano.</span>
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Consulta tu póliza, descarga tu certificado, paga tu seguro y reporta un siniestro
            desde cualquier dispositivo, las 24 horas.
          </p>
          <div className="flex gap-6 pt-4 text-xs text-slate-400">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-yellow-400" /> Datos protegidos</div>
            <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-yellow-400" /> Acceso con OTP</div>
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} HOPE Consulting · Portal del Asegurado
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* mobile-only header */}
          <div className="md:hidden mb-6 flex flex-col items-center text-center">
            <div className="rounded-xl bg-slate-900 p-4 mb-3">
              <HopeLogo variant="light" className="h-10 w-auto" />
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Portal del Asegurado</h1>
            <p className="mt-2 text-sm text-slate-600">
              Ingresa tu CURP y nombre completo. Te enviaremos un código por WhatsApp.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="curp">CURP</Label>
              <Input
                id="curp"
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase().slice(0, 18))}
                placeholder="18 caracteres"
                maxLength={18}
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como aparece en tu CURP"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white"
              disabled={loading}
            >
              {loading ? "Validando…" : "Continuar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            ¿No estás registrado? Visita{" "}
            <a href="https://www.hopeconsulting.mx" className="font-medium text-slate-700 underline">
              www.hopeconsulting.mx
            </a>
          </p>
          <p className="mt-2 text-center text-xs text-slate-400">
            <Link to="/auth" className="hover:underline">
              Acceso para personal HOPE
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
