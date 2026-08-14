import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { searchAssignableClients, setClientSalesRep } from "@/lib/sales-reps.functions";
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

export function AssignClientDialog({
  open,
  onOpenChange,
  repId,
  repName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  repId: string;
  repName: string;
}) {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const searchFn = useServerFn(searchAssignableClients);
  const assignFn = useServerFn(setClientSalesRep);

  const q = useQuery({
    queryKey: ["assignable-clients", term],
    queryFn: () => searchFn({ data: { search: term } }),
    enabled: open,
  });

  async function assign(clientId: string) {
    setBusy(clientId);
    try {
      await assignFn({ data: { client_id: clientId, sales_rep_id: repId } });
      await qc.invalidateQueries({ queryKey: ["sales-rep-detail"] });
      await qc.invalidateQueries({ queryKey: ["sales-reps"] });
      await q.refetch();
      toast.success("Cliente asignado al vendedor");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo asignar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar cliente a {repName}</DialogTitle>
          <DialogDescription>
            Busca por nombre, CURP o correo. Al asignar, sus certificados también quedan ligados a este
            vendedor.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          placeholder="Nombre, CURP o correo…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />

        <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
          {q.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Buscando…</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Sin resultados.</div>
          ) : (
            (q.data ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {c.first_name} {c.last_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {c.curp ?? "sin CURP"}
                    {c.sales_rep_id
                      ? c.sales_rep_id === repId
                        ? " · ya asignado a este vendedor"
                        : " · asignado a otro vendedor"
                      : " · sin vendedor"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={c.sales_rep_id === repId ? "outline" : "default"}
                  disabled={busy === c.id || c.sales_rep_id === repId}
                  onClick={() => assign(c.id)}
                >
                  {c.sales_rep_id === repId ? "Asignado" : "Asignar"}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
