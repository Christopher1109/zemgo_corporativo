// Etiquetas de "Empresa" según el programa: en FutCare los grupos son torneos, equipos o clubes.
export const isFutCare = (code?: string | null) => {
  const c = (code ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return c === "FUTCARE";
};

export type GroupType = "torneo" | "equipo" | "club";
export const GROUP_TYPE_LABEL: Record<GroupType, string> = { torneo: "Torneo", equipo: "Equipo", club: "Club" };
export const BILLING_MODE_LABEL: Record<string, string> = {
  company: "Paga el encargado",
  individual: "Cada quien paga",
};

export function groupLabels(programCode?: string | null) {
  if (isFutCare(programCode)) {
    return {
      fut: true,
      singular: "Torneo o equipo",
      plural: "Torneos y equipos",
      singularLower: "torneo o equipo",
      pluralLower: "torneos y equipos",
      newLabel: "Nuevo torneo o equipo",
      back: "Volver a torneos y equipos",
      search: "Buscar torneo o equipo…",
      empty: "Aún no hay torneos ni equipos registrados.",
      description: "Cada torneo o equipo agrupa a sus jugadores asegurados: un certificado por persona.",
    };
  }
  return {
    fut: false,
    singular: "Empresa",
    plural: "Empresas",
    singularLower: "empresa",
    pluralLower: "empresas",
    newLabel: "Nueva empresa",
    back: "Volver a empresas",
    search: "Buscar por razón social o RFC…",
    empty: "Aún no hay empresas registradas.",
    description: "Cada empresa agrupa a todos sus asegurados: un certificado por persona, consolidado en una sola carpeta.",
  };
}
