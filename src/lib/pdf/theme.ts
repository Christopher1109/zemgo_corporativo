// Shared visual constants for all generated PDFs.

interface ProgramPalette {
  primary: string;
  primaryDark: string;
  accent: string;
  textOnPrimary: string;
  sectionBg: string;
  sectionText: string;
}

export const PDF_THEME: {
  programs: Record<"ABC" | "FUTCARE" | "MCV", ProgramPalette>;
  hir: Record<string, string>;
  common: Record<string, string>;
} = {
  programs: {
    ABC: {
      // Verde oscuro de la marca ABC de Protección (tono modelo).
      primary: "#4E9E30",
      primaryDark: "#3A7C22",
      accent: "#D9EBCB",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#4E9E30",
      sectionText: "#FFFFFF",
    },
    FUTCARE: {
      // Azul marino oscuro (logo FUT-CARE).
      primary: "#14284E",
      primaryDark: "#0B1B38",
      accent: "#E1E6F0",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#14284E",
      sectionText: "#FFFFFF",
    },
    MCV: {
      // Vino/rosa oscuro (logo Manos con Valor).
      primary: "#A85670",
      primaryDark: "#823E56",
      accent: "#F1DDE4",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#A85670",
      sectionText: "#FFFFFF",
    },
  },
  hir: {
    primary: "#0B2E63",
    accent: "#F58220",
    warning: "#FFD400",
    textPrimary: "#1A1A1A",
    textMuted: "#555555",
    border: "#CCCCCC",
  },
  common: {
    pageBg: "#FFFFFF",
    text: "#1A1A1A",
    muted: "#666666",
    border: "#B8B8B8",
    softBorder: "#E5E5E5",
    rowAlt: "#FAFAFA",
    rowHeader: "#F0F0F0",
    rowFolio: "#F6F6F6",
    footerText: "#FFFFFF",
  },
};

export type ProgramCode = keyof typeof PDF_THEME.programs;

export function programPalette(code: string): ProgramPalette {
  const upper = (code ?? "").toUpperCase() as ProgramCode;
  return PDF_THEME.programs[upper] ?? PDF_THEME.programs.ABC;
}

export const HOPE_FOOTER =
  "Programa administrado, operado y respaldado por: ZEMGO";

export const PAGE_SIZE_LETTER = { width: 612, height: 792 } as const;
