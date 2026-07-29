import { useState } from "react";
import { Settings2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function AccountMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setCurrent(""); setNext(""); setConfirm("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return toast.error("La nueva contraseña debe tener al menos 8 caracteres");
    if (next !== confirm) return toast.error("Las contraseñas no coinciden");
    if (next === current) return toast.error("La nueva contraseña debe ser distinta a la actual");
    if (!user?.email) return toast.error("Sesión no válida");

    setBusy(true);
    // Reverificar la contraseña actual antes de permitir el cambio
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInError) {
      setBusy(false);
      return toast.error("La contraseña actual es incorrecta");
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return toast.error(error.message || "No se pudo cambiar la contraseña");

    toast.success("Contraseña actualizada. Úsala en tu próximo inicio de sesión.");
    reset();
    setOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Configuración de cuenta">
            <Settings2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="truncate font-normal text-xs text-muted-foreground">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Cambiar contraseña
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Sustituye tu contraseña predeterminada. La anterior dejará de funcionar de inmediato.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Contraseña actual</Label>
              <Input type="password" autoComplete="current-password" required
                value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input type="password" autoComplete="new-password" required minLength={8}
                value={next} onChange={(e) => setNext(e.target.value)} />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <div className="space-y-2">
              <Label>Confirmar nueva contraseña</Label>
              <Input type="password" autoComplete="new-password" required minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Actualizar contraseña"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
