import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Upload,
  Users,
  Package,
} from "lucide-react";
import { getCompanyDetail, importCompanyEmployees } from "@/lib/companies.functions";
import { renderCertificateBlob } from "@/lib/pdf/generateCertificate.browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/companies/$companyId")({
  head: () => ({
    meta: [
      { title: "Empresa — ZEMGO" },
      { name: "description", content: "Detalle de empresa, asegurados y certificados." },
    ],
  }),
  component: CompanyDetailPage,
});

const COLUMNS = [
  "Nombre(s)",
  "Apellidos",
  "CURP",
  "RFC",
  "Fecha de nacimiento (AAAA-MM-DD)",
  "Genero (M/F)",
  "Email",
  "Telefono",
  "Domicilio",
  "Beneficiario",
  "Parentesco",
];

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
function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "text" in v) return String((v as any).text ?? "");
  if (typeof v === "object" && "result" in v) return String((v as any).result ?? "");
  return String(v).trim();
}

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getCompanyDetail);
  const importFn = useServerFn(importCompanyEmployees);
  const fileRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
  const [terms, setTerms] = useState({ issue_date: today, start_date: today, end_date: nextYear, premium: "", sum_insured: "" });

  const q = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => detailFn({ data: { company_id: companyId } }),
  });

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new (ExcelJS as any).Workbook();
    const ws = wb.addWorksheet("Asegurados");
    ws.addRow(COLUMNS);
    ws.getRow(1).font = { bold: true };
    ws.columns = COLUMNS.map(() => ({ width: 26 }));
    ws.addRow(["Juan", "Pérez López", "PELJ850412HDFRLN09", "", "1985-04-12", "M", "juan@empresa.com", "8112345678", "Av. Constitución 100, Monterrey", "María Pérez", "Cónyuge"]);
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-asegurados.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
      const wb = new (ExcelJS as any).Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const rows: any[] = [];
      ws.eachRow((row: any, idx: number) => {
        if (idx === 1) return; // header
        const v = (n: number) => cellText(row.getCell(n).value);
        const first_name = v(1);
        const last_name = v(2);
        const curp = v(3);
        if (!first_name || !last_name || !curp) return;
        rows.push({
          first_name,
          last_name,
          curp,
          rfc: v(4) || null,
          date_of_birth: v(5) || null,
          gender: v(6) || null,
          email: v(7) || null,
          phone: v(8) || null,
          address_full: v(9) || null,
          beneficiary_name: v(10) || null,
          beneficiary_relationship: v(11) || null,
        });
      });

      if (rows.length === 0) {
        toast.error("No se encontraron filas válidas (Nombre, Apellidos y CURP son obligatorios).");
        return;
      }

      const res = await importFn({
        data: {
          company_id: companyId,
          file_name: file.name,
          issue_date: terms.issue_date,
          start_date: terms.start_date,
          end_date: terms.end_date,
          premium: terms.premium ? Number(terms.premium) : null,
          sum_insured: terms.sum_insured ? Number(terms.sum_insured) : null,
          rows,
        },
      });

      toast.success(`${res.created} certificado(s) generado(s)${res.failed ? ` · ${res.failed} con error` : ""}`);
      setImportOpen(false);
      await qc.invalidateQueries({ queryKey: ["company", companyId] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo procesar el archivo");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadZip(list: any[]) {
    if (list.length === 0) return;
    setZipProgress(`0/${list.length}`);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        setZipProgress(`${i}/${list.length}`);
        const blob = await renderCertificateBlob(p.id);
        const name = `${p.folio}_${(p.clients?.last_name ?? "").replace(/\s+/g, "-")}.pdf`;
        zip.file(name, await blob.arrayBuffer());
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificados-${(q.data as any)?.company?.legal_name ?? "empresa"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP descargado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el ZIP");
    } finally {
      setZipProgress(null);
    }
  }

  if (q.isLoading) return <div className="h-40 rounded-md bg-muted/40 animate-pulse" />;
  if (q.error || !q.data)
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-destructive">No se pudo cargar la empresa.</CardContent>
      </Card>
    );

  const { company, policies, payments, imports } = q.data as any;
  const paidByPolicy = new Set(payments.filter((p: any) => p.status === "paid").map((p: any) => p.policy_id));
  const active = policies.filter((p: any) => p.status === "active");
  const pending = policies.filter((p: any) => p.status !== "active" && p.status !== "cancelled");
  const totalPremium = policies.reduce((s: number, p: any) => s + Number(p.premium ?? 0), 0);
  const allReady = policies.length > 0 && pending.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/companies">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a empresas
          </Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Descargar plantilla Excel
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Cargar asegurados (Excel)
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="rounded-full p-3" style={{ backgroundColor: "var(--program-primary)", color: "white" }}>
          <Building2 className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{company.legal_name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            {company.programs && (
              <Badge
                variant="outline"
                className="font-mono"
                style={{ borderColor: company.programs.color_primary, color: company.programs.color_primary }}
              >
                {company.programs.code}
              </Badge>
            )}
            {company.rfc && <Badge variant="outline" className="font-mono">{company.rfc}</Badge>}
            {company.contact_name && <span className="text-xs">Contacto: {company.contact_name}</span>}
            {company.phone && <span className="text-xs">{company.phone}</span>}
            {company.email && <span className="text-xs">{company.email}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MiniStat label="Asegurados" value={String(new Set(policies.map((p: any) => p.client_id)).size)} />
        <MiniStat label="Certificados" value={String(policies.length)} />
        <MiniStat label="Activos" value={String(active.length)} />
        <MiniStat label="Prima total" value={fmtMx(totalPremium)} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Asegurados y certificados
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {!allReady && policies.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {pending.length} pendiente(s) de aprobación/pago
              </span>
            )}
            <Button
              size="sm"
              variant={allReady ? "default" : "outline"}
              disabled={!!zipProgress || active.length === 0}
              onClick={() => downloadZip(active)}
            >
              <Package className="h-4 w-4 mr-1" />
              {zipProgress ? `Generando ${zipProgress}…` : `Descargar certificados (${active.length})`}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {policies.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aún no hay asegurados. Descarga la plantilla, llénala y cárgala para generar un certificado por persona.
            </div>
          ) : (
            <div className="divide-y">
              {policies.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: p.clients?.id }}
                        className="font-medium hover:underline"
                      >
                        {p.clients?.first_name} {p.clients?.last_name}
                      </Link>
                      <Badge variant="outline" className="font-mono text-[10px]">{p.folio}</Badge>
                      {p.clients?.curp && (
                        <span className="text-[11px] font-mono text-muted-foreground">{p.clients.curp}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtDate(p.start_date)} → {fmtDate(p.end_date)} · {paidByPolicy.has(p.id) ? "Pagado" : "Sin pago registrado"}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : p.status === "cancelled"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                    }
                  >
                    {p.status}
                  </Badge>
                  <div className="text-right w-24">
                    <div className="text-xs text-muted-foreground">Prima</div>
                    <div className="font-semibold tabular-nums">{fmtMx(p.premium)}</div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/policies/$policyId" params={{ policyId: p.id }}>
                      <FileText className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {imports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cargas recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {imports.map((im: any) => (
              <div key={im.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-medium truncate">{im.file_name ?? "Carga manual"}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDate(im.created_at)}</div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  {im.rows_detected} detectadas · {im.rows_created} creadas
                  {im.rows_failed ? ` · ${im.rows_failed} con error` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar asegurados de {company.legal_name}</DialogTitle>
            <DialogDescription>
              Se generará un certificado por persona con estas condiciones. Si un CURP ya existe, se reutiliza el
              cliente y se liga a la empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha de emisión</Label>
              <Input type="date" value={terms.issue_date} onChange={(e) => setTerms({ ...terms, issue_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Inicio de vigencia</Label>
              <Input type="date" value={terms.start_date} onChange={(e) => setTerms({ ...terms, start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fin de vigencia</Label>
              <Input type="date" value={terms.end_date} onChange={(e) => setTerms({ ...terms, end_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Prima por persona</Label>
              <Input inputMode="decimal" value={terms.premium} onChange={(e) => setTerms({ ...terms, premium: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Suma asegurada</Label>
              <Input inputMode="decimal" value={terms.sum_insured} onChange={(e) => setTerms({ ...terms, sum_insured: e.target.value })} />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" /> Plantilla
            </Button>
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> {busy ? "Procesando…" : "Seleccionar Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
