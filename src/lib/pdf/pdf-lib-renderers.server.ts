import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCurrency, formatDate, safe } from "./formatters";

type CertificateInput = {
  policy: {
    folio?: string | null;
    policy_number?: string | null;
    certificate_number?: string | null;
    issue_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    contracting_party?: string | null;
    premium?: number | string | null;
    sum_insured?: number | string | null;
    deductible?: number | string | null;
  };
  program?: { name?: string | null; code?: string | null; color_primary?: string | null } | null;
  client?: {
    first_name?: string | null;
    last_name?: string | null;
    curp?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  beneficiaries?: Array<{ full_name?: string | null; relationship?: string | null; percentage?: number | string | null }>;
};

type AccidentNoticeInput = {
  incident: {
    accident_date?: string | null;
    accident_time?: string | null;
    description?: string | null;
    hospital?: string | null;
    location?: string | null;
  };
  policy: {
    folio?: string | null;
    policy_number?: string | null;
    certificate_number?: string | null;
    contracting_party?: string | null;
    sum_insured?: number | string | null;
    deductible?: number | string | null;
  };
  client: { full_name?: string | null; curp?: string | null; date_of_birth?: string | null };
  program?: { code?: string | null; name?: string | null; policy_number?: string | null } | null;
  deductibleOverride?: number | string | null;
};

function hexToRgb(hex?: string | null) {
  const clean = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? hex!.slice(1) : "0f172a";
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; maxWidth: number; size: number; font: PDFFont; lineHeight?: number; color?: ReturnType<typeof rgb> },
) {
  const words = safe(text, "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (opts.font.widthOfTextAtSize(next, opts.size) <= opts.maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const lineHeight = opts.lineHeight ?? opts.size + 3;
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: opts.x,
      y: opts.y - i * lineHeight,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
  });
  return opts.y - Math.max(lines.length, 1) * lineHeight;
}

function drawField(page: PDFPage, label: string, value: string, x: number, y: number, w: number, bold: PDFFont, font: PDFFont) {
  page.drawRectangle({ x, y: y - 24, width: w, height: 28, color: rgb(0.95, 0.97, 0.99), borderColor: rgb(0.84, 0.88, 0.92), borderWidth: 0.6 });
  page.drawText(label, { x: x + 8, y: y - 8, size: 7, font: bold, color: rgb(0.33, 0.42, 0.55) });
  drawWrappedText(page, value, { x: x + 8, y: y - 20, maxWidth: w - 16, size: 8.5, font, lineHeight: 9 });
}

export async function renderCertificateWithPdfLib(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(input.program?.color_primary);
  const clientName = [input.client?.first_name, input.client?.last_name].filter(Boolean).join(" ");

  page.drawRectangle({ x: 0, y: 724, width: 612, height: 68, color: primary });
  page.drawText("ZEMGO", { x: 42, y: 758, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(input.program?.name, "Programa"), { x: 42, y: 740, size: 10, font, color: rgb(1, 1, 1) });
  page.drawText("CERTIFICADO DE COBERTURA", { x: 330, y: 752, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Folio ${safe(input.policy.folio)}`, { x: 330, y: 735, size: 9, font, color: rgb(1, 1, 1) });

  let y = 690;
  page.drawText("Datos del certificado", { x: 42, y, size: 13, font: bold, color: rgb(0.05, 0.09, 0.16) });
  y -= 18;
  drawField(page, "No. de póliza", safe(input.policy.policy_number), 42, y, 165, bold, font);
  drawField(page, "No. de certificado", safe(input.policy.certificate_number ?? input.policy.folio), 222, y, 165, bold, font);
  drawField(page, "Fecha de emisión", formatDate(input.policy.issue_date), 402, y, 165, bold, font);
  y -= 46;
  drawField(page, "Titular", safe(clientName), 42, y, 255, bold, font);
  drawField(page, "CURP", safe(input.client?.curp), 312, y, 255, bold, font);
  y -= 46;
  drawField(page, "Contratante", safe(input.policy.contracting_party), 42, y, 255, bold, font);
  drawField(page, "Vigencia", `${formatDate(input.policy.start_date)} al ${formatDate(input.policy.end_date)}`, 312, y, 255, bold, font);
  y -= 46;
  drawField(page, "Prima", formatCurrency(input.policy.premium), 42, y, 165, bold, font);
  drawField(page, "Suma asegurada", formatCurrency(input.policy.sum_insured), 222, y, 165, bold, font);
  drawField(page, "Deducible", formatCurrency(input.policy.deductible), 402, y, 165, bold, font);

  y -= 58;
  page.drawText("Beneficiarios", { x: 42, y, size: 13, font: bold, color: rgb(0.05, 0.09, 0.16) });
  y -= 18;
  const beneficiaries = input.beneficiaries ?? [];
  if (beneficiaries.length === 0) {
    page.drawText("—", { x: 42, y, size: 10, font });
  } else {
    beneficiaries.forEach((b, i) => {
      page.drawText(`${i + 1}. ${safe(b.full_name)} · ${safe(b.relationship)} · ${safe(b.percentage)}%`, { x: 52, y, size: 9.5, font });
      y -= 16;
    });
  }

  page.drawRectangle({ x: 42, y: 84, width: 525, height: 1, color: rgb(0.8, 0.83, 0.87) });
  page.drawText("Documento generado automáticamente por ZEMGO.", { x: 42, y: 66, size: 8, font, color: rgb(0.38, 0.45, 0.55) });

  return new Uint8Array(await pdf.save());
}

export async function renderAccidentNoticeWithPdfLib(input: AccidentNoticeInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.96, 0.44, 0.12);
  const navy = rgb(0.04, 0.18, 0.39);
  const teal = rgb(0.11, 0.64, 0.6);

  page.drawCircle({ x: 612, y: 792, size: 92, color: orange });
  page.drawCircle({ x: 505, y: 754, size: 22, color: rgb(0.12, 0.29, 0.54) });
  page.drawRectangle({ x: 30, y: 720, width: 52, height: 52, color: orange });
  page.drawText("HIR", { x: 39, y: 742, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("SEGUROS", { x: 39, y: 733, size: 5.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("CARTA AVISO DE ACCIDENTE", { x: 100, y: 744, size: 22, font: bold, color: orange });
  page.drawCircle({ x: 612, y: 405, size: 28, color: teal });

  let y = 690;
  drawField(page, "Nombre del Contratante", safe(input.policy.contracting_party ?? input.client.full_name), 30, y, 552, bold, font);
  y -= 42;
  drawField(page, "N° de Póliza", safe(input.program?.policy_number ?? input.policy.policy_number), 30, y, 268, bold, font);
  drawField(page, "Nombre del asegurado", safe(input.client.full_name), 314, y, 268, bold, font);
  y -= 42;
  drawField(page, "Fecha de nacimiento", formatDate(input.client.date_of_birth), 30, y, 268, bold, font);
  drawField(page, "CURP", safe(input.client.curp), 314, y, 268, bold, font);
  y -= 42;
  drawField(page, "N° de Certificado", safe(input.policy.certificate_number ?? input.policy.folio), 30, y, 268, bold, font);
  drawField(page, "Suma Asegurada", formatCurrency(input.policy.sum_insured), 314, y, 268, bold, font);
  y -= 42;
  drawField(page, "Deducible", formatCurrency(input.deductibleOverride ?? input.policy.deductible), 30, y, 172, bold, font);
  drawField(page, "Fecha del accidente", formatDate(input.incident.accident_date), 219, y, 172, bold, font);
  drawField(page, "Hora", safe(input.incident.accident_time ? String(input.incident.accident_time).slice(0, 5) : null), 410, y, 172, bold, font);
  y -= 48;

  page.drawRectangle({ x: 30, y: y - 82, width: 552, height: 92, color: rgb(0.94, 0.96, 0.98), borderColor: rgb(0.84, 0.88, 0.92), borderWidth: 0.6 });
  page.drawText("Descripción detallada del accidente (lugar y cómo ocurrió):", { x: 42, y: y - 10, size: 9, font: bold, color: navy });
  drawWrappedText(page, safe(input.incident.description), { x: 42, y: y - 28, maxWidth: 528, size: 9.5, font, lineHeight: 12 });
  y -= 112;
  drawField(page, "Hospital al que se dirige", safe(input.incident.hospital), 30, y, 552, bold, font);

  y -= 52;
  y = drawWrappedText(page,
    "Hacemos constar que el accidente mencionado ocurrió dentro de la cobertura de actividades y/o horarios laborales/escolares; así mismo hacemos constar que la persona accidentada se encuentra registrada en nuestra institución, además reiteramos que los gastos que excedan la suma asegurada contratada no serán cubiertos por HIR Seguros.",
    { x: 60, y, maxWidth: 492, size: 9, font, lineHeight: 12 },
  );
  y -= 30;
  page.drawText("Graciela Rivera Bersoza", { x: 245, y, size: 10.5, font });
  y -= 14;
  page.drawRectangle({ x: 60, y: y - 12, width: 492, height: 24, color: rgb(0.94, 0.96, 0.98) });
  page.drawText("Nombre y firma del Director o Autoridad (correspondiente) (Sello)", { x: 145, y: y - 4, size: 9.5, font: bold, color: navy });
  y -= 36;
  page.drawText("Importante:", { x: 30, y, size: 9, font: bold });
  drawWrappedText(page, "La presente no implica la aceptación de la reclamación y/o autorización para atención en Pago Directo por parte de HIR Seguros, solo es de carácter informativo.", { x: 82, y, maxWidth: 500, size: 9, font, lineHeight: 11 });
  y -= 34;
  drawWrappedText(page, "ESTE PASE TIENE UNA VIGENCIA DE ATENCIÓN HASTA 48 HRS DESPUÉS DE OCURRIDO EL ACCIDENTE", { x: 85, y, maxWidth: 440, size: 11.5, font: bold, lineHeight: 13, color: orange });

  page.drawCircle({ x: 0, y: 34, size: 45, color: orange });
  page.drawCircle({ x: 55, y: 59, size: 16, color: teal });
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 40, color: navy });
  page.drawText("www.hirseguros.mx", { x: 30, y: 18, size: 8.5, font, color: rgb(1, 1, 1) });
  page.drawText("5262 1780  |  800 7348 447", { x: 225, y: 18, size: 8.5, font, color: rgb(1, 1, 1) });
  page.drawText("Hermes 28, Col. Crédito Constructor, Alc. Benito Juárez, CDMX", { x: 395, y: 18, size: 7.5, font, color: rgb(1, 1, 1) });

  return new Uint8Array(await pdf.save());
}