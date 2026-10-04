// Archivos de movimientos (ALTAS / BAJAS) en el formato exacto que pide HIR Seguros.
// Se parte de la plantilla oficial (hir-template.ts) y solo se escriben los renglones de asegurados
// a partir de la fila 18, con los mismos estilos de celda que usa la plantilla.
import { HIR_TEMPLATE_B64 } from "@/lib/hir-template";

export type HirMovement = {
  tipo: "ALTA" | "BAJA";
  certificate_number?: string | null; // obligatorio en BAJAS
  fecha_movimiento: string; // ISO yyyy-mm-dd
  paterno: string;
  materno: string;
  nombres: string;
  date_of_birth: string | null; // ISO
  sexo: 1 | 2 | null; // 1 = Masculino, 2 = Femenino
  rfc_curp?: string | null;
};

export const HIR_SUBGRUPO = 1;
export const HIR_CATEGORIA = 5;
export const HIR_DEFAULT_POLICY = "50601000157";

// ---------------------------------------------------------------- Nombres

const PARTICLES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "VAN", "VON", "DA", "DI", "SAN", "MC", "MAC"]);

/** Separa "RODRIGUEZ DE LA LUZ" → ["RODRIGUEZ", "DE LA LUZ"]; "DE LA FUENTE SANCHEZ" → ["DE LA FUENTE", "SANCHEZ"]. */
export function splitSurnames(lastName: string): [string, string] {
  const tokens = String(lastName ?? "").toUpperCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const groups: string[] = [];
  let buf: string[] = [];
  for (const t of tokens) {
    buf.push(t);
    if (!PARTICLES.has(t)) { groups.push(buf.join(" ")); buf = []; }
  }
  if (buf.length) groups.push(buf.join(" "));
  if (groups.length <= 1) return [groups[0] ?? "", ""];
  return [groups[0], groups.slice(1).join(" ")];
}

/** Apellidos de un cliente: usa los guardados por separado (metadata) y si no, los separa de last_name. */
export function surnamesOf(c: any): [string, string] {
  const p = c?.metadata?.apellido_paterno, m = c?.metadata?.apellido_materno;
  if (p) return [String(p).toUpperCase().trim(), String(m ?? "").toUpperCase().trim()];
  return splitSurnames(c?.last_name ?? "");
}

export function sexoOf(c: any): 1 | 2 | null {
  const curp = String(c?.curp ?? "").toUpperCase();
  if (/^[A-Z]{4}\d{6}[HM]/.test(curp)) return curp[10] === "H" ? 1 : 2;
  if (c?.gender === "M" || c?.gender === "H") return 1;
  if (c?.gender === "F") return 2;
  return null;
}

// ---------------------------------------------------------------- Excel

function excelSerial(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Estilos de la plantilla (fila de datos típica): A=36, B=37, C/D=38, E=39, F/G=40, H=41, I=42, J=43, K=44, L=38, M=45.
function rowXml(r: number, mv: HirMovement) {
  const cells: string[] = [];
  const str = (col: string, s: number, v?: string | null) =>
    cells.push(v ? `<c r="${col}${r}" s="${s}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : `<c r="${col}${r}" s="${s}"/>`);
  const num = (col: string, s: number, v?: number | null) =>
    cells.push(v != null && !isNaN(v) ? `<c r="${col}${r}" s="${s}"><v>${v}</v></c>` : `<c r="${col}${r}" s="${s}"/>`);
  str("A", 36, mv.tipo);
  const cert = String(mv.certificate_number ?? "").trim();
  if (/^\d+$/.test(cert)) num("B", 37, Number(cert)); else str("B", 37, cert || null);
  num("C", 38, HIR_SUBGRUPO);
  num("D", 38, HIR_CATEGORIA);
  num("E", 39, excelSerial(mv.fecha_movimiento));
  str("F", 40, mv.paterno.toUpperCase());
  str("G", 40, mv.materno.toUpperCase());
  str("H", 41, mv.nombres.toUpperCase());
  num("I", 42, excelSerial(mv.date_of_birth));
  num("J", 43, mv.sexo);
  str("K", 44, null);
  str("L", 38, mv.rfc_curp ? mv.rfc_curp.toUpperCase() : null);
  str("M", 45, null);
  return `<row r="${r}" spans="1:13">${cells.join("")}</row>`;
}

export async function buildHirMovementsFile(movs: HirMovement[], opts: { policyNumber?: string | null } = {}): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const bin = Uint8Array.from(atob(HIR_TEMPLATE_B64), (ch) => ch.charCodeAt(0));
  const zip = await JSZip.loadAsync(bin);
  const path = "xl/worksheets/sheet1.xml";
  let xml = await zip.file(path)!.async("string");
  const rows = movs.map((m, i) => rowXml(18 + i, m)).join("");
  xml = xml.replace("</sheetData>", `${rows}</sheetData>`);
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:O${Math.max(17, 17 + movs.length)}"/>`);
  const pol = String(opts.policyNumber ?? "").trim();
  if (/^\d+$/.test(pol)) xml = xml.replace(/(<c r="B13"[^>]*>)<v>\d+<\/v>/, `$1<v>${pol}</v>`);
  zip.file(path, xml);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Fecha de nacimiento contenida en una CURP o RFC (AAMMDD) cuando el cliente no la tiene capturada. */
export function dobFromId(id: string): string | null {
  const m = String(id ?? "").toUpperCase().replace(/^SIN-CURP-/, "").match(/^[A-ZÑ&]{3,4}(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const yy = +m[1], mm = +m[2], dd = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy > new Date().getFullYear() % 100 ? 1900 + yy : 2000 + yy;
  return `${year}-${m[2]}-${m[3]}`;
}

/** Convierte una póliza (con su cliente) en un renglón de movimiento HIR. */
export function movementFromPolicy(p: any, tipo: "ALTA" | "BAJA", fecha: string): HirMovement {
  const c = p.clients ?? {};
  const [paterno, materno] = surnamesOf(c);
  const curp = String(c.curp ?? "").toUpperCase();
  return {
    tipo,
    certificate_number: tipo === "BAJA" ? p.certificate_number : null,
    fecha_movimiento: fecha,
    paterno, materno,
    nombres: String(c.first_name ?? ""),
    date_of_birth: c.date_of_birth ?? dobFromId(curp) ?? dobFromId(String(c.rfc ?? "")),
    sexo: sexoOf(c),
    rfc_curp: tipo === "ALTA" ? (curp && !curp.startsWith("SIN-CURP") ? curp : c.rfc ?? null) : null,
  };
}
