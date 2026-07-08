// Editable text shown in the "Alcance" and "Qué hacer en caso de siniestro"
// collapsible sections of each policy on the portal. Update the copy per
// program code without touching component code.

export type ProgramInfoBlock = {
  alcance: string;
  siniestro: string;
};

const DEFAULT: ProgramInfoBlock = {
  alcance:
    "Cobertura nacional en hospitales autorizados. Incluye atención por accidente, gastos médicos derivados y asistencia telefónica 24/7. Consulta con tu asesor los sublímites por evento.",
  siniestro:
    "1) Llama al 800 de asistencia. 2) Acude al hospital autorizado más cercano. 3) Reporta el siniestro desde el portal para obtener tu Carta Aviso de Accidente. 4) Entrega la carta en admisión del hospital. Tienes 48 horas para dar aviso formal.",
};

// Keyed by program code (uppercase). Falls back to DEFAULT.
export const PROGRAM_INFO: Record<string, ProgramInfoBlock> = {
  ABC: {
    alcance:
      "Programa ABC: cobertura por accidente escolar con red de hospitales autorizados a nivel nacional. Incluye gastos médicos por accidente, indemnización por invalidez y apoyo funerario según certificado.",
    siniestro:
      "1) Acude de inmediato al hospital autorizado más cercano de la red ABC. 2) Reporta el siniestro desde el portal en la sección 'Siniestros → Reportar'. 3) Descarga la Carta Aviso de Accidente y entrégala en admisión. 4) Da aviso dentro de las primeras 48 horas.",
  },
  FUTCARE: {
    alcance:
      "FUT-CARE: cobertura para practicantes de fútbol amateur en entrenamientos y partidos oficiales. Incluye gastos médicos por lesión, rehabilitación y apoyo por incapacidad temporal.",
    siniestro:
      "1) Solicita atención en el hospital autorizado más cercano. 2) Reporta el evento en el portal para generar tu Carta Aviso de Accidente. 3) Presenta la carta y tu identificación en admisión. 4) Notifica a tu club dentro de las 48 horas siguientes.",
  },
  MCV: {
    alcance:
      "Manos con Valor: cobertura para trabajadoras del hogar. Incluye gastos médicos por accidente laboral, indemnización y asistencia legal básica.",
    siniestro:
      "1) Acude al hospital autorizado más cercano. 2) Avisa a tu contratante y reporta el siniestro en el portal. 3) Descarga y entrega la Carta Aviso de Accidente. 4) Reporta dentro de las primeras 48 horas.",
  },
};

export function getProgramInfo(code?: string | null): ProgramInfoBlock {
  if (!code) return DEFAULT;
  return PROGRAM_INFO[code.toUpperCase()] ?? DEFAULT;
}
