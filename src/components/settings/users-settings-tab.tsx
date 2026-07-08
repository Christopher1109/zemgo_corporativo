import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listUsers,
  createUserDirect,
  updateUserAccess,
  deactivateUser,
  reactivateUser,
  forcePasswordReset,
} from "@/lib/users.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, KeyRound, UserX, UserCheck, ShieldCheck, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "none", label: "Sin acceso" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "operator", label: "Operador" },
  { value: "claims", label: "Siniestros" },
  { value: "sales", label: "Vendedor" },
  { value: "viewer", label: "Solo lectura" },
] as const;

type Role = typeof ROLE_OPTIONS[number]["value"];

export function UsersSettingsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const q = useQuery({
    queryKey: ["settings-users"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["settings-users"] });

  if (q.isLoading) {
    return <div className="h-40 rounded-md bg-muted/40 animate-pulse" />;
  }
  if (q.error) {
    const msg = (q.error as Error).message;
    if (msg === "forbidden") {
      return (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Necesitas rol de super administrador para gestionar usuarios.
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Error: {msg}
        </CardContent>
      </Card>
    );
  }

  const data = q.data as any;
  const users = data?.users ?? [];
  const programs = data?.programs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {users.length} usuario{users.length === 1 ? "" : "s"} registrado{users.length === 1 ? "" : "s"}.
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 mr-2" /> Invitar usuario</Button>
          </DialogTrigger>
          <InviteDialog programs={programs} onDone={() => { setInviteOpen(false); invalidate(); }} />
        </Dialog>
      </div>

      <div className="grid gap-2">
        {users.map((u: any) => (
          <UserRow key={u.id} user={u} programs={programs} onChanged={invalidate} />
        ))}
      </div>
    </div>
  );
}

function InviteDialog({ programs, onDone }: { programs: any[]; onDone: () => void }) {
  const inviteFn = useServerFn(inviteUser);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<Record<string, Role>>({});

  const m = useMutation({
    mutationFn: async () =>
      inviteFn({
        data: {
          email: email.trim(),
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          access: programs.map((p) => ({ program_id: p.id, role: access[p.id] ?? "none" })),
        },
      }),
    onSuccess: () => { toast.success("Invitación enviada"); onDone(); },
    onError: (e: any) => toast.error(e.message || "Error al invitar"),
  });

  const canSubmit = email.includes("@") && fullName.trim().length >= 2;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Invitar nuevo usuario</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Nombre completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Teléfono (opcional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Acceso por programa</Label>
          <div className="grid gap-2 mt-1 max-h-56 overflow-y-auto">
            {programs.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2">
                <div
                  className="h-6 w-6 rounded grid place-items-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: p.color_primary ?? "#64748b" }}
                >
                  {p.code.slice(0, 2)}
                </div>
                <div className="flex-1 text-sm truncate">{p.name}</div>
                <Select value={access[p.id] ?? "none"} onValueChange={(v) => setAccess({ ...access, [p.id]: v as Role })}>
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!canSubmit || m.isPending} onClick={() => m.mutate()}>
          <Mail className="h-4 w-4 mr-2" />
          {m.isPending ? "Enviando…" : "Enviar invitación"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function UserRow({ user, programs, onChanged }: { user: any; programs: any[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const updateFn = useServerFn(updateUserAccess);
  const deactivateFn = useServerFn(deactivateUser);
  const reactivateFn = useServerFn(reactivateUser);
  const resetFn = useServerFn(forcePasswordReset);

  const accessMap = new Map<string, Role>();
  for (const a of user.access ?? []) accessMap.set(a.program_id, a.role as Role);

  const update = useMutation({
    mutationFn: async (v: { program_id: string; role: Role }) =>
      updateFn({ data: { user_id: user.id, program_id: v.program_id, role: v.role } }),
    onSuccess: () => { toast.success("Acceso actualizado"); onChanged(); },
    onError: (e: any) => toast.error(e.message || "Error"),
  });

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{user.full_name || "(Sin nombre)"}</span>
              {!user.is_active && <Badge variant="secondary">Inactivo</Badge>}
              {user.access?.some((a: any) => a.role === "admin") && (
                <Badge className="text-[10px]"><ShieldCheck className="h-3 w-3 mr-1" /> Admin</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{user.email ?? "—"}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(user.access ?? []).map((a: any) => {
                const p = programs.find((x: any) => x.id === a.program_id);
                if (!p) return null;
                return (
                  <Badge
                    key={a.program_id}
                    variant="outline"
                    className="text-[10px] font-mono"
                    style={{ borderColor: p.color_primary, color: p.color_primary }}
                  >
                    {p.code} · {a.role}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Cerrar" : "Editar"}
            </Button>
          </div>
        </div>

        {open && (
          <div className="mt-3 border-t pt-3 space-y-3">
            <div className="grid gap-2">
              {programs.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded grid place-items-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: p.color_primary ?? "#64748b" }}
                  >
                    {p.code.slice(0, 2)}
                  </div>
                  <div className="flex-1 text-sm truncate">{p.name}</div>
                  <Select
                    value={accessMap.get(p.id) ?? "none"}
                    onValueChange={(v) => update.mutate({ program_id: p.id, role: v as Role })}
                  >
                    <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await resetFn({ data: { user_id: user.id } });
                    toast.success("Correo de recuperación enviado");
                  } catch (e: any) { toast.error(e.message); }
                }}
              >
                <KeyRound className="h-4 w-4 mr-2" /> Restablecer contraseña
              </Button>
              {user.is_active ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    const reason = prompt("Motivo de la desactivación (mín. 5 caracteres):");
                    if (!reason || reason.length < 5) return;
                    try {
                      await deactivateFn({ data: { user_id: user.id, reason } });
                      toast.success("Usuario desactivado");
                      onChanged();
                    } catch (e: any) { toast.error(e.message); }
                  }}
                >
                  <UserX className="h-4 w-4 mr-2" /> Desactivar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await reactivateFn({ data: { user_id: user.id } });
                      toast.success("Usuario reactivado");
                      onChanged();
                    } catch (e: any) { toast.error(e.message); }
                  }}
                >
                  <UserCheck className="h-4 w-4 mr-2" /> Reactivar
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
