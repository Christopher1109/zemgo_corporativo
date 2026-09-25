// Parses the insurer's "Relación de Asegurados" (PDF from HIR Seguros) or an Excel/CSV equivalent.
export type InsurerRow = { certificate_number: string; name: string; rfc: string; alta_date: string | null };
export type InsurerFile = { policy_number: string | null; rows: InsurerRow[] };

const RFC_RE = /\b([A-ZÑ&]{4}\d{6}[A-Z0-9]{0,3})\b/;
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const TIPO_RE = /\b(TITULAR|C[OÓ]NYUGE|HIJO|HIJA|HIJOS|DEPENDIENTE|ASEGURADO|PRINCIPAL|EMPLEADO)\b/gi;

function toIso(d: string | null | undefined) {
  if (!d) return null;
  const m = String(d).match(DATE_RE);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function findPolicyNumber(text: string) {
  const m = text.match(/p[oó]liza[^0-9]{0,40}(\d{8,14})/i) ?? text.match(/\b(\d{11})\b/);
  return m ? m[1] : null;
}

async function pdfLines(file: File): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of tc.items as any[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, arr]) => {
      lines.push(arr.sort((a, b) => a.x - b.x).map((a) => a.s.trim()).join(" ").replace(/\s+/g, " "));
    });
  }
  return lines;
}

function parseLines(lines: string[]): InsurerFile {
  const policy_number = findPolicyNumber(lines.slice(0, 40).join(" ")) ?? findPolicyNumber(lines.join(" "));
  const rows: InsurerRow[] = [];
  for (const raw of lines) {
    const line = raw.toUpperCase();
    const rfc = line.match(RFC_RE);
    if (!rfc) continue;
    const cert = line.match(/^\s*(\d{1,6})\b/);
    if (!cert) continue;
    const before = line.slice(cert[0].length, rfc.index).replace(TIPO_RE, " ").replace(/[^A-ZÑÁÉÍÓÚÜ .]/g, " ").replace(/\s+/g, " ").trim();
    const date = line.slice((rfc.index ?? 0) + rfc[0].length).match(DATE_RE);
    rows.push({ certificate_number: String(parseInt(cert[1], 10)), name: before, rfc: rfc[1], alta_date: toIso(date?.[0]) });
  }
  return { policy_number, rows };
}

function parseTable(matrix: string[][]): InsurerFile {
  const all = matrix.map((r) => r.join(" ")).join(" ");
  const hIdx = matrix.findIndex((r) => r.some((c) => /rfc/i.test(c)) && r.some((c) => /cert/i.test(c)));
  if (hIdx < 0) return parseLines(matrix.map((r) => r.join(" ")));
  const h = matrix[hIdx].map((c) => c.toLowerCase());
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const cC = col(/cert/), cN = col(/nombre/), cR = col(/rfc/), cA = col(/alta/), cP = col(/p[oó]liza/);
  let policy_number = findPolicyNumber(matrix.slice(0, hIdx).map((r) => r.join(" ")).join(" "));
  const rows: InsurerRow[] = [];
  for (const r of matrix.slice(hIdx + 1)) {
    const rfc = (r[cR] ?? "").toUpperCase().trim();
    const cert = (r[cC] ?? "").trim();
    if (!rfc || !cert) continue;
    if (!policy_number && cP >= 0 && r[cP]) policy_number = r[cP].trim();
    rows.push({ certificate_number: String(parseInt(cert, 10) || cert), name: (r[cN] ?? "").toUpperCase().trim(), rfc, alta_date: toIso(r[cA]) });
  }
  return { policy_number: policy_number ?? findPolicyNumber(all), rows };
}

function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return `${v.getUTCDate()}/${v.getUTCMonth() + 1}/${v.getUTCFullYear()}`;
  if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((t: any) => t.text).join("") ?? "");
  return String(v);
}

export async function parseInsurerFile(file: File): Promise<InsurerFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return parseLines(await pdfLines(file));
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    const sep = text.includes(";") && !text.includes(",") ? ";" : ",";
    return parseTable(text.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim())));
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const matrix: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as any[]).slice(1).map(cellText);
    matrix.push(vals);
  });
  return parseTable(matrix);
}
