// /admin/users — listado con filtros, búsqueda, e invitar usuario.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, inviteUser } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: UsersIndex,
});

const ROLES = ["none", "viewer", "sales", "operator", "claims", "manager", "admin"] as const;
type RoleCode = typeof ROLES[number];

function UsersIndex() {
  const fn = useServerFn(listUsers);
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => fn() });

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = useMemo(() => {
    const users = q.data?.users ?? [];
    return users.filter((u: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(`${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(s))) return false;
      }
      if (programFilter !== "all"
        && !u.access.some((a: any) => a.program_id === programFilter)) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (roleFilter !== "all"
        && !u.access.some((a: any) => a.role === roleFilter)) return false;
      return true;
    });
  }, [q.data, search, programFilter, statusFilter, roleFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Administra accesos por programa y firmas de directores.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Invitar usuario
            </Button>
          </DialogTrigger>
          <InviteDialog
            programs={q.data?.programs ?? []}
            onClose={() => setInviteOpen(false)}
          />
        </Dialog>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-card border rounded-md p-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger><SelectValue placeholder="Programa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los programas</SelectItem>
            {(q.data?.programs ?? []).map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ROLES.filter((r) => r !== "none").map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Programas</th>
              <th className="px-4 py-2 font-medium">Último login</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!q.isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin resultados.</td></tr>
            )}
            {filtered.map((u: any) => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{u.full_name || "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.email || "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.access.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    {u.access.map((a: any) => {
                      const p = (q.data?.programs ?? []).find((x: any) => x.id === a.program_id);
                      return (
                        <Badge
                          key={a.program_id}
                          variant="outline"
                          style={{
                            borderColor: p?.color_primary ?? "#999",
                            color: p?.color_primary ?? "#444",
                          }}
                        >
                          {p?.code} · {a.role}
                        </Badge>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Nunca"}
                </td>
                <td className="px-4 py-2">
                  {u.is_active
                    ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Activo</Badge>
                    : <Badge variant="destructive">Inactivo</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link to="/admin/users/$userId" params={{ userId: u.id }}>
                    <Button variant="ghost" size="sm">Abrir</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteDialog({ programs, onClose }: { programs: any[]; onClose: () => void }) {
  const fn = useServerFn(inviteUser);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [matrix, setMatrix] = useState<Record<string, RoleCode>>({});

  const mut = useMutation({
    mutationFn: (data: any) => fn({ data }),
    onSuccess: () => {
      toast.success("Invitación enviada por email");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    },
    onError: (e: any) => {
      const m = String(e?.message ?? "");
      if (m.includes("email_already_exists")) toast.error("Ya existe un usuario con ese email");
      else toast.error(`No se pudo invitar: ${m}`);
    },
  });

  function submit() {
    if (!email || !fullName) { toast.error("Email y nombre son obligatorios"); return; }
    const access = programs.map((p) => ({
      program_id: p.id, role: matrix[p.id] ?? "none",
    }));
    if (access.every((a) => a.role === "none")) {
      toast.error("Asigna al menos un programa"); return;
    }
    mut.mutate({ email, full_name: fullName, phone: phone || null, access });
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Invitar usuario</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Nombre completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Teléfono (opcional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="mb-2 block">Accesos por programa</Label>
          <div className="border rounded-md divide-y">
            {programs.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color_primary }} />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">({p.code})</span>
                </div>
                <Select
                  value={matrix[p.id] ?? "none"}
                  onValueChange={(v) => setMatrix((m) => ({ ...m, [p.id]: v as RoleCode }))}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r === "none" ? "Sin acceso" : r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={mut.isPending}>
          {mut.isPending ? "Enviando…" : "Enviar invitación"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
