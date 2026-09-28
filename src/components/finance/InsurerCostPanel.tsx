import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { annualPrice, fmtMoney, fmtProgramPrice } from "@/lib/program-price";
import { downloadWorkbook, newWorkbook, styleHeader } from "@/lib/client-excel";

type Row = {
  policy_id: string; insurer_premium: number; insurer_premium_detail: any[] | null;
  policies: any;
};

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
};

export function InsurerCostPanel({ programId }: { programId: string | null | undefined }) {
  const [month, setMonth] = useState("all");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["insurer-costs", programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("policy_insurer_costs")
        .select("policy_id, insurer_premium, insurer_premium_detail, policies!inner(folio, certificate_number, start_date, metadata, clients(first_name, last_name, curp), programs(code, name, default_premium, billing_frequency))")
        .eq("program_id", programId)
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((r) => String(r.policies?.certificate_number ?? "").trim());
    },
  });

  const altaMonth = (r: Row) => String(r.policies?.metadata?.insurer_alta_date ?? r.policies?.start_date ?? "").slice(0, 7);
  const months = useMemo(() => [...new Set(rows.map(altaMonth).filter(Boolean))].sort().reverse(), [rows]);
  const list = month === "all" ? rows : rows.filter((r) => altaMonth(r) === month);

  const summary = useMemo(() => {
    const m = new Map<string, { name: string; price: string; count: number; revenue: number; cost: number }>();
    for (const r of list) {
      const p = r.policies?.programs;
      const k = p?.code ?? "—";
      const s = m.get(k) ?? { name: p?.name ?? k, price: fmtProgramPrice(p), count: 0, revenue: 0, cost: 0 };
      s.count++; s.revenue += annualPrice(p); s.cost += Number(r.insurer_premium);
      m.set(k, s);
    }
    return [...m.values()];
  }, [list]);

  async function exportXlsx() {
    const wb = await newWorkbook();
    const ws1 = wb.addWorksheet("Resumen");
    ws1.columns = [
      { header: "Programa", key: "name" }, { header: "Precio", key: "price" }, { header: "Certificados", key: "count" },
      { header: "Ingreso esperado (anual)", key: "revenue" }, { header: "Costo aseguradora", key: "cost" }, { header: "Margen", key: "margin" },
    ];
    summary.forEach((s) => ws1.addRow({ ...s, margin: s.revenue - s.cost }));
    styleHeader(ws1);
    const ws = wb.addWorksheet("Certificados");
    ws.columns = [
      { header: "Folio", key: "folio" }, { header: "N° Certificado", key: "cert" }, { header: "Cliente", key: "client" },
      { header: "CURP", key: "curp" }, { header: "Fecha de alta", key: "alta" }, { header: "Precio anual", key: "annual" },
      { header: "Costo aseguradora", key: "cost" }, { header: "Desglose", key: "detail" }, { header: "Margen", key: "margin" },
    ];
    for (const r of list) {
      const p = r.policies; const annual = annualPrice(p?.programs);
      ws.addRow({
        folio: p?.folio, cert: p?.certificate_number,
        client: `${p?.clients?.first_name ?? ""} ${p?.clients?.last_name ?? ""}`.trim(), curp: p?.clients?.curp,
        alta: p?.metadata?.insurer_alta_date ?? p?.start_date ?? "", annual, cost: Number(r.insurer_premium),
        detail: (r.insurer_premium_detail ?? []).map((d: any) => `${d.code}: ${d.prima}`).join(" · "),
        margin: annual - Number(r.insurer_premium),
      });
    }
    styleHeader(ws);
    [ws1, ws].forEach((w) => w.columns.forEach((c: any) => { if (/Precio anual|Ingreso|Costo|Margen/.test(String(c.header))) c.numFmt = "$#,##0.00"; }));
    await downloadWorkbook(wb, `costo-aseguradora-${month}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Prima neta que HIR cobra por asegurado, solo para certificados ya asignados.</p>
        <div className="flex gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses de alta</SelectItem>
              {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={list.length === 0} onClick={exportXlsx}>
            <Download className="h-4 w-4 mr-1" />Excel
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Programa</TableHead><TableHead>Precio</TableHead><TableHead className="text-right">Certificados</TableHead>
            <TableHead className="text-right">Ingreso esperado (anual)</TableHead><TableHead className="text-right">Costo aseguradora</TableHead><TableHead className="text-right">Margen</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {summary.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{isLoading ? "Cargando…" : "Sin certificados con costo asignado."}</TableCell></TableRow>}
            {summary.map((s) => (
              <TableRow key={s.name}>
                <TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.price}</TableCell>
                <TableCell className="text-right">{s.count}</TableCell>
                <TableCell className="text-right">{fmtMoney(s.revenue)}</TableCell>
                <TableCell className="text-right">{fmtMoney(s.cost)}</TableCell>
                <TableCell className="text-right font-semibold">{fmtMoney(s.revenue - s.cost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Folio</TableHead><TableHead>Certificado</TableHead><TableHead>Cliente</TableHead><TableHead>Alta</TableHead>
            <TableHead>Desglose</TableHead><TableHead className="text-right">Costo</TableHead><TableHead className="text-right">Margen</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.map((r) => {
              const p = r.policies; const annual = annualPrice(p?.programs);
              return (
                <TableRow key={r.policy_id}>
                  <TableCell className="font-mono text-xs">{p?.folio}</TableCell>
                  <TableCell>{p?.certificate_number}</TableCell>
                  <TableCell>{p?.clients?.first_name} {p?.clients?.last_name}</TableCell>
                  <TableCell>{p?.metadata?.insurer_alta_date ?? p?.start_date ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{(r.insurer_premium_detail ?? []).map((d: any) => `${d.code} ${fmtMoney(d.prima)}`).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.insurer_premium)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(annual - Number(r.insurer_premium))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
