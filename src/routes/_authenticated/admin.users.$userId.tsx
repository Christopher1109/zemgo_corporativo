// /admin/users/$userId — user detail, access matrix, signature, activity, actions.
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getUserDetail, updateUserAccess, deactivateUser, reactivateUser,
  forcePasswordReset, signOutUserSessions, setSignatureUrl,
} from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, AlertTriangle, KeyRound, LogOut, Upload, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: UserDetail,
});

const ROLES = ["none", "viewer", "sales", "operator", "claims", "manager", "admin"] as const;

function UserDetail() {
  const { userId } = Route.useParams();
  const fn = useServerFn(getUserDetail);
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => fn({ data: { user_id: userId } }),
  });

  const isManagerOrAdmin = (q.data?.access ?? []).some(
    (a: any) => a.role === "manager" || a.role === "admin",
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link to="/admin/users">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Button>
        </Link>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {q.error && <div className="text-sm text-destructive">Error: {String((q.error as any)?.message)}</div>}

      {q.data && (
        <>
          {/* Header */}
          <div className="bg-card border rounded-md p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{q.data.profile.full_name || "(sin nombre)"}</h1>
                <p className="text-muted-foreground text-sm">{q.data.profile.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tel: {q.data.profile.phone || "—"} · Creado: {new Date(q.data.profile.created_at).toLocaleDateString()}
                  · Último login: {q.data.profile.last_sign_in_at
                    ? new Date(q.data.profile.last_sign_in_at).toLocaleString() : "Nunca"}
                </p>
              </div>
              {q.data.profile.is_active
                ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Activo</Badge>
                : <Badge variant="destructive">Inactivo</Badge>}
            </div>
            <ActionsBar userId={userId} isActive={q.data.profile.is_active} />
          </div>

          {/* Anti-lockout warning */}
          {q.data.sole_admin_programs.length > 0 && (
            <div className="border border-amber-400 bg-amber-50 text-amber-900 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <strong>Atención:</strong> este usuario es el único administrador en{" "}
                {q.data.sole_admin_programs
                  .map((pid: string) => q.data.programs.find((p: any) => p.id === pid)?.code)
                  .filter(Boolean).join(", ")}.{" "}
                Asigna otro admin en cada uno de esos programas antes de remover su acceso o desactivarlo.
              </div>
            </div>
          )}

          {/* Signature */}
          {isManagerOrAdmin && (
            <SignatureBlock
              userId={userId}
              currentUrl={q.data.profile.signature_signed_url}
              onUpdated={() => navigate({ to: "/admin/users/$userId", params: { userId } })}
            />
          )}

          {/* Access matrix */}
          <AccessMatrix
            userId={userId}
            access={q.data.access}
            programs={q.data.programs}
          />

          {/* Audit */}
          <div className="bg-card border rounded-md">
            <div className="px-4 py-3 border-b font-medium">Actividad reciente</div>
            <ul className="divide-y text-sm">
              {q.data.audit.length === 0 && (
                <li className="px-4 py-6 text-muted-foreground text-center">Sin actividad registrada.</li>
              )}
              {q.data.audit.map((a: any) => (
                <li key={a.id} className="px-4 py-2 flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-36 shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div><strong className="font-mono text-xs">{a.action}</strong> · {a.entity_type}</div>
                    {a.diff && (
                      <pre className="text-xs text-muted-foreground bg-muted/40 rounded p-1 mt-1 overflow-x-auto">
                        {JSON.stringify(a.diff, null, 0)}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ActionsBar({ userId, isActive }: { userId: string; isActive: boolean }) {
  const qc = useQueryClient();
  const deact = useServerFn(deactivateUser);
  const react = useServerFn(reactivateUser);
  const reset = useServerFn(forcePasswordReset);
  const so = useServerFn(signOutUserSessions);
  const [reason, setReason] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-user", userId] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const onReset = async () => {
    try { await reset({ data: { user_id: userId } }); toast.success("Email de reseteo enviado"); }
    catch (e: any) { toast.error(`No se pudo: ${e?.message}`); }
  };
  const onSignOut = async () => {
    try { await so({ data: { user_id: userId } }); toast.success("Sesiones cerradas"); invalidate(); }
    catch (e: any) { toast.error(`No se pudo: ${e?.message}`); }
  };
  const onDeactivate = async () => {
    if (reason.trim().length < 5) { toast.error("Motivo obligatorio (≥ 5 chars)"); return; }
    try {
      await deact({ data: { user_id: userId, reason } });
      toast.success("Usuario desactivado"); invalidate(); setReason("");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("last_admin_in_program"))
        toast.error("No se puede: es el único admin de un programa.");
      else if (m.includes("cannot_deactivate_self")) toast.error("No puedes autodesactivarte.");
      else toast.error(`No se pudo: ${m}`);
    }
  };
  const onReactivate = async () => {
    try { await react({ data: { user_id: userId } }); toast.success("Usuario reactivado"); invalidate(); }
    catch (e: any) { toast.error(`No se pudo: ${e?.message}`); }
  };

  return (
    <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onReset}>
        <KeyRound className="h-4 w-4 mr-2" /> Forzar reset de contraseña
      </Button>
      <Button variant="outline" size="sm" onClick={onSignOut}>
        <LogOut className="h-4 w-4 mr-2" /> Cerrar sesiones activas
      </Button>
      {isActive ? (
        <div className="flex items-center gap-2 ml-auto">
          <Input
            placeholder="Motivo de desactivación"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-64"
          />
          <Button variant="destructive" size="sm" onClick={onDeactivate}>
            <Power className="h-4 w-4 mr-2" /> Desactivar
          </Button>
        </div>
      ) : (
        <Button size="sm" className="ml-auto" onClick={onReactivate}>
          <Power className="h-4 w-4 mr-2" /> Reactivar
        </Button>
      )}
    </div>
  );
}

function AccessMatrix({
  userId, access, programs,
}: {
  userId: string;
  access: Array<{ program_id: string; role: string }>;
  programs: Array<{ id: string; code: string; name: string; color_primary: string }>;
}) {
  const fn = useServerFn(updateUserAccess);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of programs) {
      init[p.id] = access.find((a) => a.program_id === p.id)?.role ?? "none";
    }
    return init;
  });

  const save = async (programId: string, role: string) => {
    try {
      await fn({ data: { user_id: userId, program_id: programId, role: role as any } });
      toast.success("Acceso actualizado");
      qc.invalidateQueries({ queryKey: ["admin-user", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("last_admin_in_program"))
        toast.error("No se puede: es el único admin del programa.");
      else if (m.includes("cannot_remove_own_admin"))
        toast.error("No puedes quitarte tu propio rol admin.");
      else toast.error(`No se pudo: ${m}`);
      // revert
      setDraft((d) => ({ ...d, [programId]: access.find((a) => a.program_id === programId)?.role ?? "none" }));
    }
  };

  return (
    <div className="bg-card border rounded-md">
      <div className="px-4 py-3 border-b font-medium">Permisos por programa</div>
      <ul className="divide-y">
        {programs.map((p) => (
          <li key={p.id} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color_primary }} />
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">({p.code})</span>
            </div>
            <Select
              value={draft[p.id] ?? "none"}
              onValueChange={(v) => { setDraft((d) => ({ ...d, [p.id]: v })); save(p.id, v); }}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r === "none" ? "Sin acceso" : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignatureBlock({
  userId, currentUrl, onUpdated,
}: {
  userId: string;
  currentUrl: string | null;
  onUpdated: () => void;
}) {
  const fn = useServerFn(setSignatureUrl);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error("Máx. 2 MB"); return; }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${userId}/signature.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("signatures")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
      if (upErr) throw upErr;
      await fn({ data: { user_id: userId, storage_path: path } });
      toast.success("Firma actualizada");
      onUpdated();
    } catch (e: any) {
      toast.error(`No se pudo subir: ${e?.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-card border rounded-md p-4">
      <div className="font-medium mb-2">Firma del director</div>
      <p className="text-xs text-muted-foreground mb-3">
        Se usa en cartas HIR cuando este usuario aprueba un siniestro. PNG transparente recomendado, máx. 2 MB.
      </p>
      <div className="flex items-center gap-4">
        <div className="border rounded-md p-2 w-48 h-24 flex items-center justify-center bg-muted/30">
          {currentUrl
            ? <img src={currentUrl} alt="Firma" className="max-h-20 max-w-full object-contain" />
            : <span className="text-xs text-muted-foreground">Sin firma</span>}
        </div>
        <Label className="cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm
            ${uploading ? "opacity-50" : "hover:bg-muted"}`}>
            <Upload className="h-4 w-4" /> {uploading ? "Subiendo…" : "Subir firma"}
          </span>
        </Label>
      </div>
    </div>
  );
}
