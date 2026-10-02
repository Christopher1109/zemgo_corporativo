import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteClient } from "@/lib/clients.functions";

export function DeleteClientDialog({ client }: { client: { id: string; first_name: string; last_name?: string | null } }) {
  const navigate = useNavigate();
  const run = useServerFn(deleteClient);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");

  async function doDelete() {
    setBusy(true);
    try {
      await run({ data: { client_id: client.id } });
      toast.success("Cliente eliminado.");
      navigate({ to: "/clients" });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo eliminar el cliente.");
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10">
          <Trash2 className="h-4 w-4 mr-2" /> Eliminar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará permanentemente a <strong>{client.first_name} {client.last_name ?? ""}</strong> junto con
            sus certificados, pagos, siniestros y afiliaciones. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Escribe ELIMINAR para confirmar</label>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ELIMINAR" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={doDelete} disabled={busy || confirm !== "ELIMINAR"}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Eliminar definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
