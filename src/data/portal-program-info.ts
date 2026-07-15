// Editable text shown in the "Alcance" and "Qué hacer en caso de siniestro"
// collapsible sections of each policy on the portal.

export type CoverageLine = { label: string; amount: string };

export type ProgramInfoBlock = {
  alcance: string;
  coverages: CoverageLine[];
  siniestro: string[];
};

const SINIESTRO_STEPS: string[] = [
  "Ingresa al portal de clientes Zemgo.",
  "Llena el Aviso de Accidente con tus datos y la descripción del siniestro.",
  "Acude al hospital y muestra el Aviso de Accidente.",
  "Solicita tu folio de Ingreso Hospitalario.",
  "Una vez aprobado el dictamen (puede tardar alrededor de 4 horas), pasa a pagar el deducible en el área de caja del hospital.",
];

const DEFAULT: ProgramInfoBlock = {
  alcance:
    "Cobertura respaldada por aseguradora autorizada, con red de hospitales por programa. Consulta a tu asesor los sublímites por evento.",
  coverages: [],
  siniestro: SINIESTRO_STEPS,
};

export const PROGRAM_INFO: Record<string, ProgramInfoBlock> = {
  ABC: {
    alcance:
      "Programa diseñado para brindar seguridad, respaldo y tranquilidad ante los eventos inesperados de la vida. Con coberturas clave en vida, accidentes personales y servicios funerarios, ofrece protección integral para el asegurado y su familia, combinando beneficios reales a un costo accesible.",
    coverages: [
      { label: "Por fallecimiento", amount: "$100,000 M.N." },
      { label: "En caso de muerte accidental, apoyo adicional de", amount: "$50,000 M.N." },
      { label: "Gastos médicos por accidente", amount: "$25,000 M.N." },
      { label: "Servicios funerarios", amount: "$25,000 M.N." },
    ],
    siniestro: SINIESTRO_STEPS,
  },
  FUTCARE: {
    alcance:
      "Programa diseñado para jugadores de fútbol soccer amateur, que brinda cobertura ante accidentes durante entrenamientos o partidos, incluyendo protección por muerte accidental y pérdidas orgánicas, ofreciendo seguridad, respaldo y tranquilidad tanto para los jugadores como para sus familias.",
    coverages: [
      { label: "Accidentes deportivos en competencia, entrenamiento y traslados sin escala", amount: "$75,000" },
      { label: "Muerte accidental durante partido o entrenamiento (en menores de 12 años aplica gastos funerarios)", amount: "$150,000" },
      { label: "Pérdidas orgánicas", amount: "$150,000" },
    ],
    siniestro: SINIESTRO_STEPS,
  },
  MCV: {
    alcance:
      "Diseñado para respaldar y proteger a las trabajadoras del hogar, brindando confianza, seguridad y tranquilidad para ellas y su familia en todo momento. Ante cualquier imprevisto o accidente, contará con apoyo, acompañamiento y la atención necesaria para no estar sola en ningún momento.",
    coverages: [
      { label: "Gastos médicos por accidente", amount: "$50,000" },
      { label: "Muerte accidental", amount: "$100,000" },
    ],
    siniestro: SINIESTRO_STEPS,
  },
};

export function getProgramInfo(code?: string | null): ProgramInfoBlock {
  if (!code) return DEFAULT;
  return PROGRAM_INFO[code.toUpperCase()] ?? DEFAULT;
}
