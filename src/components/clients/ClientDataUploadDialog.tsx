import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseClientDataSheet, applyClientDataChanges, type SheetChange } from "@/lib/client-data-sheet";

const LABEL: Record<string, string> = { curp: "CURP", rfc: "RFC", date_of_birth: "Nacimiento", gender: "Género", marital_status: "Estado civil", phone: "Teléfono", email: "Email" };

export function ClientDataUploadDialog({ programId }: { programId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ changes: SheetChange[]; errors: string[] } | null>(null);

  async function onFile(f?: File) {
    if (!f || !programId) return;
    setBusy(true);
    try { setRes(await parseClientDataSheet(f, programId)); }
    catch (e: any) { toast.error(e.message ?? "No se pudo leer el archivo"); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!res) return;
    setBusy(true);
    const { ok, failed } = await applyClientDataChanges(res.changes);
    setBusy(false);
    if (failed.length) toast.error(`${failed.length} no se guardaron: ${failed[0]}`);
    toast.success(`${ok} clientes actualizados`);
    qc.invalidateQueries({ queryKey: ["clients"] });
    setOpen(false); setRes(null);
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setRes(null); setOpen(true); }} disabled={!programId}>
        <Upload className="h-4 w-4 mr-2" /> Subir datos llenados
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Subir datos de clientes</DialogTitle></DialogHeader>
          {!res && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Sube el mismo Excel que descargaste, ya llenado. Solo se actualizan CURP, RFC, fecha de nacimiento, género, estado civil, teléfono y email. Las celdas vacías no borran datos existentes.</p>
              <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          )}
          {res && (
            <div className="space-y-3 max-h-[60vh] overflow-auto">
              <p className="text-sm"><b>{res.changes.length}</b> clientes con cambios.</p>
              {res.errors.length > 0 && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-0.5">
                  <p className="font-medium">Renglones con problemas (se omiten):</p>
                  {res.errors.slice(0, 30).map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <table className="w-full text-xs">
                <thead><tr className="text-left border-b"><th className="py-1">Cliente</th><th>Cambios</th></tr></thead>
                <tbody>
                  {res.changes.map((c) => (
                    <tr key={c.id} className="border-b align-top">
                      <td className="py-1 pr-2 font-medium">{c.name}</td>
                      <td className="py-1">{Object.entries(c.changes).map(([k, v]) => (
                        <div key={k}><span className="text-muted-foreground">{LABEL[k]}:</span> {String(v.from || "—")} → <b>{String(v.to)}</b></div>
                      ))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            {res && <Button variant="ghost" onClick={() => setRes(null)}>Elegir otro archivo</Button>}
            {res && <Button onClick={apply} disabled={busy || res.changes.length === 0}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar cambios</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
