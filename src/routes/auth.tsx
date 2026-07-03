import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { HopeLogo } from "@/components/hope-logo";

// Username-based login. Usernames are mapped to a synthetic email
// `${username}@hope.local` so we can keep using Supabase Auth.
// Public sign-up is disabled — users are pre-created by an admin.
const USERNAME_DOMAIN = "hope.local";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Iniciar sesión — ZEMGO" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const email = `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Usuario o contraseña incorrectos");
    toast.success("Bienvenido");
    router.invalidate();
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
           style={{ background: "radial-gradient(ellipse at top, #facc15 0%, transparent 55%)" }} />
      <Card className="w-full max-w-md relative z-10 border-slate-200 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto rounded-xl bg-[#0a1628] px-5 py-3 inline-flex items-center gap-3">
            <HopeLogo variant="light" className="h-9 w-auto" />
            <div className="text-left leading-tight text-white">
              <div className="text-sm font-bold">ZEMGO</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-300">
                Agente de seguros y fianzas
              </div>
            </div>
          </div>
          <div>
            <CardTitle className="text-xl">Acceso interno</CardTitle>
            <CardDescription>
              Plataforma administrativa · solo personal autorizado
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={busy}>
              {busy ? "Iniciando..." : "Entrar"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              ¿No tienes acceso? Solicítalo al administrador.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

