// Generador de la "Carta Aviso de Accidente" (HIR Seguros) para el portal.
// Usa la plantilla oficial como imagen de fondo y sobrepone los datos
// dinámicos del siniestro / póliza / cliente. Devuelve el PDF en base64.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getCookie } from "@tanstack/react-start/server";
import bgAsset from "@/assets/accident-notice-hir-bg.jpg.asset.json";

const COOKIE = "portal_token";

function getToken(): string | null {
  try {
    const h = getRequestHeader("x-portal-token");
    if (h && h.length >= 32) return h;
  } catch {}
  try {
    return getCookie(COOKIE) ?? null;
  } catch {
    return null;
  }
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v + (v.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
}

function fmtMoney(v?: number | string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

// Positions measured against a 1200x1552 reference image (Letter aspect).
// Scale factor from image px → PDF pt: 612/1200 = 0.51
const SCALE = 612 / 1200;
const PAGE_H_PT = 792; // Letter height pt
const px = (n: number) => n * SCALE;
// Convert an image-px y (top origin) into a pdf-lib y (bottom origin) baseline.
const pxY = (n: number, fontSize = 10) => PAGE_H_PT - n * SCALE - fontSize;

type FieldPos = { x: number; y: number; maxW?: number; size?: number };

const F: Record<string, FieldPos> = {
  contratante:      { x: 360, y: 195, maxW: 750, size: 11 },
  poliza:           { x: 260, y: 260, maxW: 320, size: 11 },
  asegurado:        { x: 800, y: 260, maxW: 320, size: 11 },
  fechaNac:         { x: 320, y: 325, maxW: 260, size: 11 },
  curp:             { x: 750, y: 325, maxW: 370, size: 11 },
  certificado:      { x: 305, y: 390, maxW: 280, size: 11 },
  sumaAsegurada:    { x: 795, y: 390, maxW: 330, size: 11 },
  deducible:        { x: 240, y: 455, maxW: 210, size: 11 },
  fechaAccidente:   { x: 695, y: 455, maxW: 175, size: 11 },
  hora:             { x: 970, y: 455, maxW: 155, size: 11 },
  descripcion:      { x: 115, y: 545, maxW: 1000, size: 10 }, // multi-line
  hospital:         { x: 340, y: 785, maxW: 780, size: 11 },
};

// Word-wrap by max width in image-px (converted to pt at draw time).
function wrapLines(text: string, maxWidthPx: number, size: number, font: any): string[] {
  const maxPt = maxWidthPx * SCALE;
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    const width = font.widthOfTextAtSize(cand, size);
    if (width > maxPt && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export const portalAccidentNotice = createServerFn({ method: "POST" })
  .inputValidator((d: { incident_id: string }) => d)
  .handler(async ({ data }) => {
    const token = getToken();
    if (!token) throw new Error("sesion_invalida");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await (supabaseAdmin.rpc as any)(
      "get_portal_accident_notice",
      { _token: token, _incident_id: data.incident_id },
    );
    if (error) throw new Error(error.message);
    if (!payload) throw new Error("siniestro_no_encontrado");

    const { incident, policy, client } = payload as {
      incident: { accident_date?: string; accident_time?: string; description?: string; hospital?: string };
      policy: {
        policy_number?: string; certificate_number?: string; folio?: string;
        contracting_party?: string; sum_insured?: number; deductible?: number;
      };
      client: { full_name?: string; curp?: string; date_of_birth?: string };
    };

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);

    // Fondo: plantilla oficial HIR.
    const bgBytes = await fetch(new URL(bgAsset.url, "https://l").href.replace("https://l", "https://colorado-guardian.lovable.app") ).then((r) => r.arrayBuffer()).catch(() => null);
    // Fallback: intentar URL relativa via el host actual. Si falla, dejar página en blanco.
    let bgUrl = bgAsset.url;
    let bytes: ArrayBuffer | null = bgBytes;
    if (!bytes) {
      try {
        const host = getRequestHeader("host") ?? "";
        const proto = (getRequestHeader("x-forwarded-proto") ?? "https").split(",")[0].trim();
        bgUrl = `${proto}://${host}${bgAsset.url}`;
        bytes = await fetch(bgUrl).then((r) => r.arrayBuffer());
      } catch {
        bytes = null;
      }
    }
    if (bytes) {
      const img = await pdf.embedJpg(bytes);
      page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const black = rgb(0.08, 0.10, 0.15);

    const draw = (key: keyof typeof F, value: string) => {
      const p = F[key];
      const size = p.size ?? 11;
      page.drawText(String(value ?? "—"), {
        x: px(p.x),
        y: pxY(p.y, size),
        size,
        font,
        color: black,
        maxWidth: p.maxW ? px(p.maxW) : undefined,
      });
    };

    draw("contratante", policy.contracting_party || client.full_name || "—");
    draw("poliza", policy.policy_number || policy.folio || "—");
    draw("asegurado", client.full_name || "—");
    draw("fechaNac", fmtDate(client.date_of_birth));
    draw("curp", (client.curp || "—").toUpperCase());
    draw("certificado", policy.certificate_number || policy.folio || "—");
    draw("sumaAsegurada", fmtMoney(policy.sum_insured));
    draw("deducible", fmtMoney(policy.deductible));
    draw("fechaAccidente", fmtDate(incident.accident_date));
    draw("hora", incident.accident_time ? String(incident.accident_time).slice(0, 5) : "—");
    draw("hospital", incident.hospital || "—");

    // Descripción multi-línea.
    const descPos = F.descripcion;
    const descSize = descPos.size ?? 10;
    const lines = wrapLines(incident.description || "—", descPos.maxW ?? 1000, descSize, font);
    const lineHeightPx = 22; // separación aproximada entre líneas (imagen px)
    lines.slice(0, 8).forEach((ln, i) => {
      page.drawText(ln, {
        x: px(descPos.x),
        y: pxY(descPos.y + i * lineHeightPx, descSize),
        size: descSize,
        font,
        color: black,
      });
    });

    const bytesOut = await pdf.save();
    // Devolver base64 para descargar desde el navegador.
    let bin = "";
    for (let i = 0; i < bytesOut.length; i++) bin += String.fromCharCode(bytesOut[i]);
    // Buffer está disponible en el Worker con nodejs_compat.
    const b64 = Buffer.from(bytesOut).toString("base64");
    void bin;

    return { pdf_base64: b64, filename: `Aviso-Accidente-${policy.folio ?? "SIN-FOLIO"}.pdf` };
  });
