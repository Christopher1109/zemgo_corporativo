import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getSalesRepDetail,
  searchAssignablePolicies,
  setPolicySalesRep,
  deleteSalesRep,
} from "@/lib/sales-reps.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, User, FileText, Plus, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales-reps/$repId")({
  head: () => ({ meta: [{ title: "Vendedor — ZEMGO" }] }),
  component: SalesRepDetailPage,
});

function fmtMx(n: number) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function SalesRepDetailPage() {
  const { repId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getSalesRepDetail);
  const searchFn = useServerFn(searchAssignablePolicies);
  const setRepFn = useServerFn(setPolicySalesRep);
  const deleteFn = useServerFn(deleteSalesRep);

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unlinkPolicy, setUnlinkPolicy] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["sales-rep", repId],
    queryFn: () => fn({ data: { sales_rep_id: repId } }),
  });

  const candidates = useQuery({
    queryKey: ["assignable-policies", search],
    queryFn: () => searchFn({ data: { search, only_unassigned: false } }),
    enabled: addOpen,
  });

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["sales-rep", repId] });
    await qc.invalidateQueries({ queryKey: ["sales-reps"] });
    await qc.invalidateQueries({ queryKey: ["assignable-policies"] });
  }

  async function assign(policyId: string) {
    setBusy(true);
    try {
      await setRepFn({ data: { policy_id: policyId, sales_rep_id: repId } });
      toast.success("Certificado asignado al vendedor");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo asignar");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(policyId: string) {
    setBusy(true);
    try {
      await setRepFn({ data: { policy_id: policyId, sales_rep_id: null } });
      toast.success("Certificado desligado del vendedor");
      setUnlinkPolicy(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo desligar");
    } finally {
      setBusy(false);
    }
  }

  async function removeRep() {
    setBusy(true);
    try {
      await deleteFn({ data: { sales_rep_id: repId } });
      toast.success("Vendedor eliminado");
      setConfirmDelete(false);
      navigate({ to: "/sales-reps" });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar el vendedor");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return <div className="h-40 rounded-md bg-muted/40 animate-pulse" />;
  }
  if (q.error || !q.data) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-destructive">No se pudo cargar el vendedor.</CardContent></Card>
    );
  }

  const { rep, policies } = q.data as any;
  const active = policies.filter((p: any) => p.status === "active");
  const totalPremium = policies.reduce((s: number, p: any) => s + Number(p.premium ?? 0), 0);
  const uniqueClients = new Set(policies.map((p: any) => p.clients?.id).filter(Boolean));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sales-reps"><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Link>
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Eliminar vendedor
        </Button>
      </div>

      <div className="flex items-start gap-4">
        <div className="rounded-full p-3" style={{ backgroundColor: "var(--program-primary)", color: "white" }}>
          <User className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{rep.full_name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            {rep.code && <Badge variant="outline" className="font-mono">{rep.code}</Badge>}
            {rep.referral_source && <span className="text-xs">Fuente: {rep.referral_source}</span>}
            {!rep.is_active && <Badge variant="secondary">inactivo</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MiniStat label="Clientes" value={String(uniqueClients.size)} />
        <MiniStat label="Pólizas activas" value={String(active.length)} />
        <MiniStat label="Total pólizas" value={String(policies.length)} />
        <MiniStat label="Prima emitida" value={fmtMx(totalPremium)} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Cartera
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar certificado
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {policies.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Aún no tiene pólizas asignadas.</div>
          ) : (
            <div className="divide-y">
              {policies.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-sm">
                  <Link
                    to="/policies/$policyId"
                    params={{ policyId: p.id }}
                    className="flex flex-1 items-center gap-3 min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {p.clients?.first_name} {p.clients?.last_name}
                        </span>
                        {p.programs && (
                          <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: p.programs.color_primary, color: p.programs.color_primary }}>
                            {p.programs.code}
                          </Badge>
                        )}
                        <Badge variant="outline" className="font-mono text-[10px]">{p.folio}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        p.status === "active"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : p.status === "expired"
                            ? "bg-rose-100 text-rose-800 border-rose-200"
                            : "bg-slate-100 text-slate-700"
                      }
                    >
                      {p.status}
                    </Badge>
                    <div className="text-right w-24">
                      <div className="text-xs text-muted-foreground">Prima</div>
                      <div className="font-semibold tabular-nums">{fmtMx(p.premium)}</div>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Quitar de este vendedor"
                    onClick={() => setUnlinkPolicy(p)}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agregar certificado */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar certificado a {rep.full_name}</DialogTitle>
            <DialogDescription>
              Busca por folio. Al asignarlo, el cliente de ese certificado también queda ligado a este vendedor.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar por folio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
            {candidates.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
            ) : (candidates.data ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Sin resultados.</div>
            ) : (
              (candidates.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 p-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {p.clients?.first_name} {p.clients?.last_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {p.folio} · {p.programs?.code} · {fmtMx(p.premium)}
                      {p.sales_rep_id && p.sales_rep_id !== repId ? " · ya asignado a otro vendedor" : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={p.sales_rep_id === repId ? "outline" : "default"}
                    disabled={busy || p.sales_rep_id === repId}
                    onClick={() => assign(p.id)}
                  >
                    {p.sales_rep_id === repId ? "Asignado" : "Asignar"}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar quitar certificado */}
      <AlertDialog open={!!unlinkPolicy} onOpenChange={(o) => !o && setUnlinkPolicy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este certificado del vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              El certificado {unlinkPolicy?.folio} quedará sin vendedor asignado y dejará de contar para su comisión. El certificado y el cliente no se eliminan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => unlinkPolicy && unassign(unlinkPolicy.id)}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar eliminar vendedor */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {rep.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el vendedor y se desligará todo su historial: {policies.length} certificado(s) y {uniqueClients.size} cliente(s) quedarán sin vendedor. Los clientes, certificados y pagos NO se borran. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={removeRep}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
