import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { renewPolicy } from "@/lib/policies-edit.functions";
import { toast } from "sonner";

export function RenewPolicyDialog({
  open, onOpenChange, policy,
}: { open: boolean; onOpenChange: (o: boolean) => void; policy: any }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fn = useServerFn(renewPolicy);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [premium, setPremium] = useState("");

  useEffect(() => {
    if (open && policy) {
      const today = new Date().toISOString().slice(0, 10);
      const baseStart = policy.end_date && policy.end_date >= today ? policy.end_date : today;
      const start = new Date(baseStart);
      const end = new Date(start); end.setFullYear(end.getFullYear() + 1);
      setStartDate(baseStart);
      setEndDate(end.toISOString().slice(0, 10));
      setPremium(String(policy.premium ?? ""));
    }
  }, [open, policy]);

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      source_policy_id: policy.id,
      overrides: { start_date: startDate, end_date: endDate, premium: Number(premium) },
    } }),
    onSuccess: (res: any) => {
      toast.success(`Renovación creada: ${res.folio}`);
      qc.invalidateQueries({ queryKey: ["policy", policy.id] });
      onOpenChange(false);
      navigate({ to: "/policies/$policyId", params: { policyId: res.new_policy_id } });
    },
    onError: (e: any) => {
      const friendly: Record<string, string> = {
        forbidden: "No tienes permisos para renovar esta póliza.",
      };
      const m = e?.message ?? "Error";
      toast.error(friendly[m] ?? (m.startsWith("cannot_renew_in_state:") ? "La póliza no puede renovarse en su estado actual." : m));
    },
  });

  if (!policy) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Renovar póliza</DialogTitle>
          <DialogDescription>
            Se creará una nueva póliza con folio consecutivo, clonando beneficiarios y dependientes.
          </DialogDescription>
        </DialogHeader>

        <Card className="p-3 bg-muted/30 text-xs space-y-1">
          <div><span className="text-muted-foreground">Origen:</span> <span className="font-mono">{policy.folio}</span></div>
          <div><span className="text-muted-foreground">Cliente:</span> {policy.clients?.first_name} {policy.clients?.last_name}</div>
          <div><span className="text-muted-foreground">Programa:</span> {policy.programs?.name}</div>
          <div><span className="text-muted-foreground">Vigencia actual:</span> {policy.start_date} → {policy.end_date}</div>
          <div><span className="text-muted-foreground">Prima actual:</span> ${Number(policy.premium ?? 0).toLocaleString("es-MX")}</div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nueva vigencia inicio</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nueva vigencia fin</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Prima nueva</Label>
            <Input type="number" step="0.01" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear renovación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
