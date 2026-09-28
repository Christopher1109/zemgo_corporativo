import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { annualPrice, fmtMoney } from "@/lib/program-price";

/** Solo visible para superadmin y admin/gerente del programa (la base de datos lo protege). */
export function InsurerCostCard({ policy }: { policy: any }) {
  const programId = policy.program_id;
  const { data: allowed } = useQuery({
    queryKey: ["can-view-insurer-cost", programId],
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("can_view_insurer_cost", { _program_id: programId });
      return !!data;
    },
    enabled: !!programId,
  });
  const { data: cost } = useQuery({
    queryKey: ["insurer-cost", policy.id],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("policy_insurer_costs")
        .select("insurer_premium, insurer_premium_detail").eq("policy_id", policy.id).maybeSingle();
      return data as { insurer_premium: number; insurer_premium_detail: any[] | null } | null;
    },
    enabled: !!allowed,
  });
  if (!allowed) return null;

  const hasCert = !!String(policy.certificate_number ?? "").trim();
  const annual = annualPrice(policy.programs);
  const detail = Array.isArray(cost?.insurer_premium_detail) ? cost!.insurer_premium_detail : [];

  return (
    <Card className="p-5 space-y-3">
      <h3 className="text-sm font-semibold">Costo aseguradora (HIR)</h3>
      {!hasCert || !cost ? (
        <p className="text-sm text-muted-foreground">Se asigna junto con el número de certificado.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid sm:grid-cols-3 gap-4">
            <div><div className="text-xs text-muted-foreground">Prima neta HIR</div><div className="font-semibold">{fmtMoney(cost.insurer_premium)}</div></div>
            <div><div className="text-xs text-muted-foreground">Precio anual del programa</div><div className="font-semibold">{fmtMoney(annual)}</div></div>
            <div><div className="text-xs text-muted-foreground">Margen</div><div className="font-semibold">{fmtMoney(annual - Number(cost.insurer_premium))}</div></div>
          </div>
          {detail.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="py-1">Cobertura</th><th>Suma asegurada</th><th className="text-right">Prima neta</th></tr></thead>
              <tbody>
                {detail.map((d: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 font-medium">{d.code}</td>
                    <td>{d.sum_insured ? fmtMoney(d.sum_insured) : "—"}</td>
                    <td className="text-right">{fmtMoney(d.prima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
