import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPortalAccess } from "@/lib/portal/portal.functions";

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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <span className="text-xl font-bold">H</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal del Asegurado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Consulta tu póliza, paga tu seguro y reporta siniestros.
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
              className="font-mono uppercase"
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Validando…" : "Continuar"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          ¿No estás registrado? Visita{" "}
          <a href="https://www.hopeconsulting.mx" className="underline">
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
  );
}
