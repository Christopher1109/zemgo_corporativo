// Ficha de torneo/equipo (FutCare): plantilla protegida, alta masiva con revisión, bajas,
// certificados en ZIP, modo de pago y cobro grupal / individual con recordatorios por WhatsApp.
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Upload, Package, Send, FileText, CheckCircle2, AlertTriangle, XCircle, Wallet } from "lucide-react";
import {
  importCompanyEmployees,
  cancelGroupMembers,
  refreshGroupCharge,
  setGroupBillingMode,
  markGroupPaymentPaid,
} from "@/lib/companies.functions";
import { sendGroupPaymentReminders } from "@/lib/group-reminders";
import { alertsFor } from "@/lib/company-roster";
import { renderCertificateBlob, generateCertificateClient } from "@/lib/pdf/generateCertificate.browser";
import { BILLING_MODE_LABEL } from "@/lib/group-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export const FUTCARE_HEADERS = [
  "NOMBRE(S)",
  "APELLIDO PATERNO",
  "APELLIDO MATERNO",
  "FECHA DE NACIMIENTO (DD/MM/AAAA)",
  "CURP",
  "GÉNERO (H/M)",
  "ESTADO CIVIL",
  "EMAIL",
  "TELÉFONO (10 dígitos)",
  "CALLE Y NÚMERO",
  "COLONIA",
  "CIUDAD",
  "ESTADO",
  "CÓDIGO POSTAL",
  "BENEFICIARIO (NOMBRE COMPLETO)",
  "PARENTESCO DEL BENEFICIARIO",
] as const;
const MARITAL = ["Soltero(a)", "Casado(a)", "Unión libre", "Divorciado(a)", "Viudo(a)"];
const SHEET_PASSWORD = "zemgo-futcare-plantilla";
const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const BATCH = 10;

const fmtMx = (n: number) => `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const safe = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "text" in v) return String(v.text ?? "").trim();
  if (typeof v === "object" && "result" in v) return cellText(v.result);
  if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((r) => r.text).join("").trim();
  return String(v).trim();
}
function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function hexToArgb(hex?: string | null) {
  const h = (hex ?? "#16a34a").replace("#", "");
  return `FF${(h.length === 3 ? h.split("").map((c) => c + c).join("") : h).toUpperCase()}`;
}

type ParsedRow = {
  row: number;
  first_name: string;
  last_name: string;
  paterno: string;
  materno: string;
  curp: string;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  colonia: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  beneficiary_name: string | null;
  beneficiary_relationship: string | null;
  errors: string[];
  alert: string | null;
};

type Review = {
  fileName: string;
  nuevos: ParsedRow[];
  conErrores: ParsedRow[];
  yaRegistrados: ParsedRow[];
  noVienen: any[]; // policies vigentes que no están en el archivo
};

export function FutCareGroupPanel({
  company,
  policies,
  payments,
  groupCharges,
}: {
  company: any;
  policies: any[];
  payments: any[];
  groupCharges: any[];
}) {
  const qc = useQueryClient();
  const importFn = useServerFn(importCompanyEmployees);
  const cancelFn = useServerFn(cancelGroupMembers);
  const refreshFn = useServerFn(refreshGroupCharge);
  const modeFn = useServerFn(setGroupBillingMode);
  const fileRef = useRef<HTMLInputElement>(null);

  const price = Number(company.programs?.default_premium ?? 950);
  const groupName: string = company.legal_name;
  const current = policies.filter((p) => p.status !== "cancelled");
  const billingMode: "company" | "individual" = company.billing_mode === "individual" ? "individual" : "company";

  const [review, setReview] = useState<Review | null>(null);
  const [bajaMode, setBajaMode] = useState<"none" | "all" | "pick">("none");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [modeConfirm, setModeConfirm] = useState<"company" | "individual" | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [remindConfirm, setRemindConfirm] = useState<{ ids?: string[]; label: string } | null>(null);
  const [noPhoneSent, setNoPhoneSent] = useState<string[]>([]);
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "pending">("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["company", company.id] });

  // ------------------------------------------------------------ Plantilla
  async function downloadTemplate() {
    const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Asegurados", { views: [{ state: "frozen", ySplit: 1 }] });
    const fill = hexToArgb(company.programs?.color_primary);
    ws.columns = FUTCARE_HEADERS.map((h) => ({ header: h, width: Math.max(18, h.length + 4) }));
    const head = ws.getRow(1);
    head.height = 32;
    head.eachCell((c: any) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.protection = { locked: true };
    });
    for (let r = 2; r <= 1000; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= FUTCARE_HEADERS.length; c++) {
        const cell = row.getCell(c);
        cell.protection = { locked: false };
        if (c === 9 || c === 14) cell.numFmt = "@";
        if (c === 4) cell.numFmt = "dd/mm/yyyy";
        if (c === 6) cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"H,M"'], showErrorMessage: true, errorTitle: "Género", error: "Escribe H o M" };
        if (c === 7) cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${MARITAL.join(",")}"`], showErrorMessage: true, error: "Elige un estado civil de la lista" };
        if (c === 4) cell.dataValidation = { type: "date", operator: "between", allowBlank: true, formulae: [new Date(1900, 0, 1), new Date(2100, 0, 1)], showErrorMessage: true, error: "Escribe una fecha DD/MM/AAAA" };
      }
    }
    await ws.protect(SHEET_PASSWORD, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      insertColumns: false,
      deleteColumns: false,
      deleteRows: true,
      sort: false,
      autoFilter: false,
    });

    const ins = wb.addWorksheet("Instrucciones");
    ins.getColumn(1).width = 110;
    [
      `Plantilla FutCare — ${groupName}`,
      "",
      "1. Captura UNA persona por fila en la hoja \"Asegurados\", a partir de la fila 2.",
      "2. NOMBRE(S), APELLIDO PATERNO, FECHA DE NACIMIENTO y CURP son obligatorios.",
      "3. La CURP debe tener 18 caracteres y su fecha debe coincidir con la fecha de nacimiento.",
      "4. Fecha de nacimiento en formato DD/MM/AAAA. No hace falta poner la edad: el sistema la calcula.",
      "5. Género: H (hombre) o M (mujer). Estado civil: elige de la lista.",
      "6. Teléfono a 10 dígitos, sin espacios ni guiones.",
      "7. NO cambies, muevas ni borres los títulos de las columnas: el sistema no aceptará el archivo.",
      "8. Si vuelves a subir la plantilla, puedes dejar a los que ya estaban; solo se dan de alta los nuevos.",
    ].forEach((t, i) => {
      const c = ins.getCell(i + 1, 1);
      c.value = t;
      if (i === 0) c.font = { bold: true, size: 14 };
    });
    await ins.protect(SHEET_PASSWORD, { selectLockedCells: true, selectUnlockedCells: true });

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Plantilla_FutCare_${safe(groupName)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function onFile(file: File) {
    try {
      const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.getWorksheet("Asegurados") ?? wb.worksheets[0];
      const headers = FUTCARE_HEADERS.map((_, i) => cellText(ws?.getRow(1).getCell(i + 1).value));
      if (!ws || headers.some((h, i) => h !== FUTCARE_HEADERS[i])) {
        toast.error("Este archivo no es la plantilla de este torneo/equipo; descarga la plantilla y vuelve a llenarla.");
        return;
      }
      const rows: ParsedRow[] = [];
      const seen = new Map<string, number>();
      for (let i = 2; i <= ws.rowCount; i++) {
        const r = ws.getRow(i);
        const v = (c: number) => cellText(r.getCell(c).value);
        const vals = FUTCARE_HEADERS.map((_, c) => v(c + 1));
        if (vals.every((x) => !x)) continue;
        const curp = v(5).toUpperCase().replace(/\s+/g, "");
        const dob = parseDate(r.getCell(4).value);
        const phone = v(9).replace(/\D/g, "");
        const g = v(6).toUpperCase();
        const errors: string[] = [];
        if (!v(1)) errors.push("Falta nombre");
        if (!v(2)) errors.push("Falta apellido paterno");
        if (!dob) errors.push(v(4) ? "Fecha de nacimiento inválida" : "Falta fecha de nacimiento");
        if (!curp) errors.push("Falta CURP");
        else if (!CURP_RE.test(curp)) errors.push("CURP con formato inválido");
        if (phone && phone.length !== 10) errors.push("Teléfono debe tener 10 dígitos");
        if (curp && seen.has(curp)) errors.push(`CURP duplicada en el archivo (fila ${seen.get(curp)})`);
        if (curp && !seen.has(curp)) seen.set(curp, i);
        const al = CURP_RE.test(curp) ? alertsFor(curp, dob, "plantilla_futcare") : [];
        const street = v(10) || null, colonia = v(11) || null, city = v(12) || null, state = v(13) || null;
        const zip = v(14) ? v(14).replace(/\D/g, "").padStart(5, "0") : null;
        rows.push({
          row: i,
          first_name: v(1).toUpperCase(),
          paterno: v(2).toUpperCase(),
          materno: v(3).toUpperCase(),
          last_name: [v(2), v(3)].filter(Boolean).join(" ").toUpperCase(),
          curp,
          date_of_birth: dob,
          gender: g === "H" ? "M" : g === "M" ? "F" : null,
          marital_status: v(7) || null,
          email: v(8) || null,
          phone: phone || null,
          street,
          colonia,
          city,
          state,
          zip,
          beneficiary_name: v(15) || null,
          beneficiary_relationship: v(16) || null,
          errors,
          alert: al[0]?.message ?? null,
        });
      }
      if (!rows.length) {
        toast.error("La plantilla no tiene asegurados capturados.");
        return;
      }
      const currentCurps = new Map(current.map((p) => [String(p.clients?.curp ?? "").toUpperCase(), p]));
      const fileCurps = new Set(rows.map((r) => r.curp));
      const valid = rows.filter((r) => !r.errors.length);
      setReview({
        fileName: file.name,
        conErrores: rows.filter((r) => r.errors.length),
        yaRegistrados: valid.filter((r) => currentCurps.has(r.curp)),
        nuevos: valid.filter((r) => !currentCurps.has(r.curp)),
        noVienen: current.filter((p) => !fileCurps.has(String(p.clients?.curp ?? "").toUpperCase())),
      });
      setBajaMode("none");
      setPicked(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!review) return;
    setSaving(true);
    try {
      let createdPolicies: any[] = [];
      if (review.nuevos.length) {
        const res: any = await importFn({
          data: {
            company_id: company.id,
            file_name: review.fileName,
            group_terms: true,
            rows: review.nuevos.map((r) => ({
              first_name: r.first_name,
              last_name: r.last_name,
              curp: r.curp,
              date_of_birth: r.date_of_birth,
              gender: r.gender,
              email: r.email,
              phone: r.phone,
              marital_status: r.marital_status,
              street: r.street,
              colonia: r.colonia,
              city: r.city,
              state: r.state,
              zip: r.zip,
              address_full: [r.street, r.colonia, r.city, r.state, r.zip ? `C.P. ${r.zip}` : null].filter(Boolean).join(", ") || null,
              beneficiary_name: r.beneficiary_name,
              beneficiary_relationship: r.beneficiary_relationship,
              curp_alert: r.alert,
            })),
          },
        });
        createdPolicies = res.policies ?? [];
        if (res.failed) toast.warning(`${res.failed} persona(s) no se pudieron dar de alta.`);
      }
      const bajaIds =
        bajaMode === "all" ? review.noVienen.map((p) => p.id) : bajaMode === "pick" ? [...picked] : [];
      if (bajaIds.length) {
        const r = await cancelFn({ data: { company_id: company.id, policy_ids: bajaIds } });
        toast.success(`${r.cancelled} baja(s) aplicada(s)`);
      }
      await refreshFn({ data: { company_id: company.id } });
      toast.success(`${createdPolicies.length} asegurado(s) dado(s) de alta`);
      setReview(null);
      await refresh();
      if (createdPolicies.length) {
        await downloadZip(
          createdPolicies.map((p) => ({ id: p.id, folio: p.folio, clients: { first_name: p.first_name, last_name: p.last_name } })),
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo completar el alta");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------ Certificados
  async function downloadZip(list: any[]) {
    if (!list.length) return toast.info("No hay certificados para descargar.");
    setZip({ done: 0, total: list.length });
    try {
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      let failed = 0;
      for (let i = 0; i < list.length; i += BATCH) {
        const chunk = list.slice(i, i + BATCH);
        for (const p of chunk) {
          try {
            const blob = await renderCertificateBlob(p.id);
            const name = `${p.folio}_${safe((p.clients?.last_name ?? "").split(" ")[0])}_${safe(p.clients?.first_name ?? "")}.pdf`;
            z.file(name, await blob.arrayBuffer());
          } catch {
            failed += 1;
          }
          setZip((s) => (s ? { ...s, done: s.done + 1 } : s));
          await yieldUI();
        }
      }
      const out = await z.generateAsync({ type: "blob", compression: "STORE" });
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certificados_${safe(groupName)}_${today}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(failed ? `ZIP descargado · ${failed} certificado(s) no se pudieron generar` : "ZIP descargado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el ZIP");
    } finally {
      setZip(null);
    }
  }

  async function downloadOne(p: any) {
    try {
      await generateCertificateClient(p.id);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el certificado");
    }
  }

  // ------------------------------------------------------------ Cobro
  async function changeMode(mode: "company" | "individual") {
    try {
      await modeFn({ data: { company_id: company.id, billing_mode: mode } });
      toast.success(`Modo de pago: ${BILLING_MODE_LABEL[mode]}`);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["companies"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cambiar el modo de pago");
    } finally {
      setModeConfirm(null);
    }
  }

  async function sendReminders(ids?: string[]) {
    try {
      const r = await sendGroupPaymentReminders({ company_id: company.id, payment_ids: ids });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setNoPhoneSent(r.noPhone.map((x) => x.name));
      if (r.sent.length) toast.success(`Recordatorio enviado a ${r.sent.length} persona(s)`);
      if (r.failed.length) toast.error(`${r.failed.length} no se pudieron enviar: ${r.failed[0].error}`);
      if (!r.sent.length && !r.failed.length && r.noPhone.length) toast.warning("Nadie tiene teléfono registrado; no se envió.");
      qc.invalidateQueries({ queryKey: ["whatsapp", "reminder-log"] });
    } catch {
      toast.error("No se pudo enviar el recordatorio");
    } finally {
      setRemindConfirm(null);
    }
  }

  const openCharge = groupCharges.find((c) => c.status === "pending" || c.status === "overdue");
  const lastCharge = openCharge ?? groupCharges[0];
  const pendingCerts = current.filter((p) => p.status !== "active").length;

  const payByPolicy = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of payments) {
      if (["cancelled", "refunded"].includes(p.status)) continue;
      const prev = m.get(p.policy_id);
      if (!prev || p.status === "paid" || (prev.status !== "paid" && ["pending", "overdue"].includes(p.status))) m.set(p.policy_id, p);
    }
    return m;
  }, [payments]);
  const isPaid = (pol: any) => payByPolicy.get(pol.id)?.status === "paid" || pol.status === "active";
  const paidList = current.filter(isPaid);
  const pendingList = current.filter((p) => !isPaid(p));
  const cobrado = paidList.reduce((s, p) => s + Number(payByPolicy.get(p.id)?.paid_amount ?? payByPolicy.get(p.id)?.amount ?? p.premium ?? price), 0);
  const pendiente = pendingList.reduce((s, p) => s + Number(payByPolicy.get(p.id)?.amount ?? p.premium ?? price), 0);
  const phoneOf = (p: any) => (p.clients?.phone || p.clients?.payer_phone || "").replace(/\D/g, "");
  const pendingWithPay = pendingList.filter((p) => ["pending", "overdue"].includes(payByPolicy.get(p.id)?.status));
  const pendingNoPhone = pendingWithPay.filter((p) => phoneOf(p).length < 10);

  const tableRows = current.filter((p) =>
    billingMode === "company" || payFilter === "all" ? true : payFilter === "paid" ? isPaid(p) : !isPaid(p),
  );

  return (
    <>
      <Tabs defaultValue="asegurados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="asegurados">Asegurados</TabsTrigger>
          <TabsTrigger value="plantilla">Plantilla</TabsTrigger>
          <TabsTrigger value="cobro">Cobro</TabsTrigger>
        </TabsList>

        <TabsContent value="plantilla" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={downloadTemplate} className="rounded-xl border bg-card p-6 text-left transition hover:border-primary/60 shadow-card">
              <Download className="h-8 w-8" style={{ color: "var(--program-primary)" }} />
              <div className="mt-3 text-lg font-semibold">Descargar plantilla</div>
              <p className="mt-1 text-sm text-muted-foreground">Excel protegido con las columnas exactas. Solo se capturan datos, una persona por fila.</p>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border bg-card p-6 text-left transition hover:border-primary/60 shadow-card">
              <Upload className="h-8 w-8" style={{ color: "var(--program-primary)" }} />
              <div className="mt-3 text-lg font-semibold">Subir plantilla</div>
              <p className="mt-1 text-sm text-muted-foreground">Revisa nuevos, errores y bajas antes de confirmar. Al aceptar se generan los certificados.</p>
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          <p className="text-xs text-muted-foreground">
            Vigencia de todos los certificados del grupo: {fmtDate(new Date(company.created_at).toLocaleDateString("en-CA", { timeZone: "America/Monterrey" }))} a un año. Precio por persona: {fmtMx(price)}.
          </p>
        </TabsContent>

        <TabsContent value="asegurados">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
              <CardTitle className="text-base">Asegurados ({current.length})</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {billingMode === "individual" && (
                  <div className="flex rounded-md border p-0.5 text-xs">
                    {(["all", "paid", "pending"] as const).map((f) => (
                      <button key={f} type="button" className={`rounded px-2 py-1 ${payFilter === f ? "bg-muted font-medium" : ""}`} onClick={() => setPayFilter(f)}>
                        {f === "all" ? "Todos" : f === "paid" ? `Pagó (${paidList.length})` : `Pendiente (${pendingList.length})`}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="sm" disabled={!!zip || !current.length} onClick={() => downloadZip(current)}>
                  <Package className="h-4 w-4 mr-1" /> Descargar todos los certificados (ZIP)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {zip && <ZipProgress zip={zip} />}
              {!tableRows.length ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Aún no hay asegurados. Descarga la plantilla, llénala y súbela.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="text-left px-4 py-2">Nombre</th>
                        <th className="text-left px-2 py-2">CURP</th>
                        <th className="text-left px-2 py-2">Folio</th>
                        <th className="text-left px-2 py-2">Certificado</th>
                        {billingMode === "individual" && <th className="text-left px-2 py-2">Pago</th>}
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tableRows.map((p) => {
                        const pay = payByPolicy.get(p.id);
                        const paid = isPaid(p);
                        return (
                          <tr key={p.id} className="hover:bg-muted/40">
                            <td className="px-4 py-2 font-medium">{p.clients?.first_name} {p.clients?.last_name}</td>
                            <td className="px-2 py-2 font-mono text-[11px]">{p.clients?.curp}</td>
                            <td className="px-2 py-2 font-mono text-[11px]">{p.folio}</td>
                            <td className="px-2 py-2">
                              <Badge variant="outline" className={p.status === "active" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}>
                                {p.status === "active" ? "Activo" : "Pendiente de pago"}
                              </Badge>
                            </td>
                            {billingMode === "individual" && (
                              <td className="px-2 py-2">
                                {paid ? <Badge className="bg-emerald-600">Pagó</Badge> : <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">Pendiente</Badge>}
                              </td>
                            )}
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              {billingMode === "individual" && !paid && pay && ["pending", "overdue"].includes(pay.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={phoneOf(p).length < 10}
                                  title={phoneOf(p).length < 10 ? "Sin teléfono registrado" : "Enviar link de pago"}
                                  onClick={() => setRemindConfirm({ ids: [pay.id], label: `¿Enviar link de pago por WhatsApp a ${p.clients?.first_name} ${p.clients?.last_name}? Esto genera un cargo de WhatsApp.` })}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" title="Descargar certificado" onClick={() => downloadOne(p)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cobro" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="text-xs text-muted-foreground">Modo de pago</div>
                <div className="font-semibold">{BILLING_MODE_LABEL[billingMode]}</div>
              </div>
              <div className="flex rounded-md border p-0.5">
                {(["company", "individual"] as const).map((m) => (
                  <Button key={m} size="sm" variant={billingMode === m ? "default" : "ghost"} onClick={() => billingMode !== m && setModeConfirm(m)}>
                    {BILLING_MODE_LABEL[m]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {billingMode === "company" ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Cobro del grupo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!lastCharge ? (
                  <p className="text-muted-foreground">Aún no hay cobro grupal. Se genera al dar de alta asegurados.</p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Stat label="Monto" value={fmtMx(lastCharge.amount)} />
                      <Stat label="Certificados × precio" value={`${lastCharge.metadata?.certificates ?? lastCharge.metadata?.insured_count ?? pendingCerts} × ${fmtMx(lastCharge.metadata?.unit_price ?? price)}`} />
                      <Stat label="Vencimiento" value={fmtDate(lastCharge.due_date)} />
                      <Stat label="Estado" value={lastCharge.status === "paid" ? "Pagado" : lastCharge.status === "overdue" ? "Vencido" : lastCharge.status === "pending" ? "Pendiente" : lastCharge.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Referencia bancaria: <span className="font-mono text-foreground">{lastCharge.bank_reference ?? "—"}</span>
                    </div>
                    {openCharge && (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" onClick={() => setPayOpen(true)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Registrar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(company.phone ?? "").replace(/\D/g, "").length < 10}
                          title={(company.phone ?? "").replace(/\D/g, "").length < 10 ? "El encargado no tiene teléfono" : undefined}
                          onClick={() => setRemindConfirm({ label: `¿Enviar recordatorio de pago por WhatsApp a ${company.contact_name ?? "el encargado"}? Esto genera un cargo de WhatsApp.` })}
                        >
                          <Send className="h-4 w-4 mr-1" /> Enviar recordatorio al encargado
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">En este modo los asegurados no reciben mensajes; solo el encargado.</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pagos individuales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Pagados" value={`${paidList.length} de ${current.length}`} />
                  <Stat label="Cobrado" value={fmtMx(cobrado)} />
                  <Stat label="Pendiente" value={fmtMx(pendiente)} />
                </div>
                <Button
                  size="sm"
                  disabled={!pendingWithPay.length}
                  onClick={() =>
                    setRemindConfirm({
                      label: `Se enviará el link de pago por WhatsApp a ${pendingWithPay.length - pendingNoPhone.length} persona(s). ${pendingNoPhone.length} no tienen teléfono y no recibirán mensaje. Esto genera un cargo de WhatsApp.`,
                    })
                  }
                >
                  <Send className="h-4 w-4 mr-1" /> Enviar link de pago a todos los pendientes
                </Button>
                {noPhoneSent.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="font-semibold mb-1">Sin teléfono, no se envió ({noPhoneSent.length})</div>
                    {noPhoneSent.join(" · ")}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Usa la pestaña Asegurados para ver quién pagó y enviar el link a una persona.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Revisión de la plantilla */}
      <Dialog open={!!review} onOpenChange={(v) => !v && !saving && setReview(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {review && (
            <>
              <DialogHeader>
                <DialogTitle>Revisión de la plantilla — {groupName}</DialogTitle>
                <DialogDescription>{review.fileName}. Nada se guarda hasta que confirmes.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Nuevos" value={String(review.nuevos.length)} />
                <Stat label="Ya registrados (se ignoran)" value={String(review.yaRegistrados.length)} />
                <Stat label="Con errores" value={String(review.conErrores.length)} />
                <Stat label="Total a cobrar estimado" value={fmtMx(review.nuevos.length * price)} />
              </div>

              <RowTable title="Nuevos" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} rows={review.nuevos} extra={(r) => r.alert ? <span className="text-amber-700">{r.alert}</span> : null} />
              {review.nuevos.some((r) => r.alert) && (
                <RowTable title="Con alertas de CURP (sí se dan de alta, quedan marcados)" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} rows={review.nuevos.filter((r) => r.alert)} extra={(r) => r.alert} />
              )}
              {review.conErrores.length > 0 && (
                <RowTable title="Con errores (no se dan de alta)" icon={<XCircle className="h-4 w-4 text-rose-600" />} rows={review.conErrores} extra={(r) => <span className="text-rose-700">{r.errors.join(" · ")}</span>} />
              )}

              {current.length > 0 && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="font-semibold text-sm">¿Va a haber bajas?</div>
                  {[
                    { v: "none", t: "No, solo agregar los nuevos" },
                    { v: "all", t: `Sí, dar de baja a todos los que ya no vienen en el archivo (${review.noVienen.length})` },
                    { v: "pick", t: "Sí, quiero elegir a quién dar de baja" },
                  ].map((o) => (
                    <label key={o.v} className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={bajaMode === o.v} onChange={() => setBajaMode(o.v as any)} /> {o.t}
                    </label>
                  ))}
                  {bajaMode === "all" && (
                    <div className="text-xs text-muted-foreground max-h-40 overflow-auto">
                      {review.noVienen.length ? review.noVienen.map((p) => `${p.clients?.first_name} ${p.clients?.last_name} (${p.folio})`).join(" · ") : "Todos vienen en el archivo."}
                    </div>
                  )}
                  {bajaMode === "pick" && (
                    <div className="max-h-56 overflow-auto grid sm:grid-cols-2 gap-1">
                      {current.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={picked.has(p.id)}
                            onChange={(e) => {
                              const n = new Set(picked);
                              e.target.checked ? n.add(p.id) : n.delete(p.id);
                              setPicked(n);
                            }}
                          />
                          {p.clients?.first_name} {p.clients?.last_name} <span className="font-mono text-muted-foreground">{p.folio}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {zip && <ZipProgress zip={zip} />}
              <DialogFooter>
                <Button variant="outline" disabled={saving} onClick={() => setReview(null)}>Cancelar</Button>
                <Button
                  disabled={saving || (!review.nuevos.length && bajaMode === "none") || (bajaMode === "pick" && !picked.size && !review.nuevos.length)}
                  onClick={confirmImport}
                >
                  {saving ? "Guardando…" : "Aceptar y dar de alta"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!modeConfirm} onOpenChange={(v) => !v && setModeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar a "{modeConfirm ? BILLING_MODE_LABEL[modeConfirm] : ""}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {modeConfirm === "company"
                ? "Se cancelarán los cobros individuales pendientes y se generará un solo cobro grupal para el encargado."
                : "Se cancelará el cobro grupal abierto y cada asegurado tendrá su propio pago pendiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => modeConfirm && changeMode(modeConfirm)}>Cambiar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!remindConfirm} onOpenChange={(v) => !v && setRemindConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar por WhatsApp</AlertDialogTitle>
            <AlertDialogDescription>{remindConfirm?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendReminders(remindConfirm?.ids)}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {openCharge && <GroupPaymentDialog open={payOpen} onOpenChange={setPayOpen} companyId={company.id} charge={openCharge} onDone={refresh} />}
    </>
  );
}

function GroupPaymentDialog({ open, onOpenChange, companyId, charge, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; companyId: string; charge: any; onDone: () => void }) {
  const fn = useServerFn(markGroupPaymentPaid);
  const [amount, setAmount] = useState(String(charge.amount ?? ""));
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" }));
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "card" | "bank_reference" | "oxxo">("bank_transfer");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = Number(amount);
    if (!(n > 0)) return toast.error("Monto inválido");
    setBusy(true);
    try {
      await fn({ data: { company_id: companyId, payment_id: charge.id, paid_amount: n, paid_at: `${date}T12:00:00-06:00`, method, reference: ref || null } });
      toast.success("Pago registrado; los certificados del grupo se activan.");
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar el pago");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago del grupo</DialogTitle>
          <DialogDescription>Al registrarlo se activan todos los certificados pendientes del grupo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Monto pagado</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de pago</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Método</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="bank_transfer">Transferencia</option>
              <option value="bank_reference">Referencia bancaria</option>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="oxxo">OXXO</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label>Referencia / folio de pago</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Registrar pago"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZipProgress({ zip }: { zip: { done: number; total: number } }) {
  return (
    <div className="px-4 py-3 space-y-1">
      <div className="text-xs text-muted-foreground">Generando certificados {zip.done} de {zip.total}…</div>
      <Progress value={(zip.done / Math.max(1, zip.total)) * 100} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function RowTable({ title, icon, rows, extra }: { title: string; icon: React.ReactNode; rows: ParsedRow[]; extra: (r: ParsedRow) => React.ReactNode }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">{icon} {title} ({rows.length})</div>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-xs">
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={`${r.row}-${r.curp}`}>
                <td className="px-3 py-1.5 text-muted-foreground">Fila {r.row}</td>
                <td className="px-2 py-1.5 font-medium">{r.first_name} {r.last_name}</td>
                <td className="px-2 py-1.5 font-mono">{r.curp || "—"}</td>
                <td className="px-2 py-1.5">{fmtDate(r.date_of_birth)}</td>
                <td className="px-2 py-1.5">{extra(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
