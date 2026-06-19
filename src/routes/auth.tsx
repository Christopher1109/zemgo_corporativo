import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Username-based login. Usernames are mapped to a synthetic email
// `${username}@hope.local` so we can keep using Supabase Auth.
// Public sign-up is disabled — users are pre-created by an admin.
const USERNAME_DOMAIN = "hope.local";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Iniciar sesión — HOPE Consulting" }] }),
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">HOPE Consulting</CardTitle>
          <CardDescription>
            Plataforma interna · acceso solo para usuarios autorizados
          </CardDescription>
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
            <Button type="submit" className="w-full" disabled={busy}>
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
