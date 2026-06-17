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
      primary: "#2E7D32",
      primaryDark: "#1B5E20",
      accent: "#E8F5E9",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#C8E6C9",
      sectionText: "#1B5E20",
    },
    FUTCARE: {
      primary: "#0F4C9C",
      primaryDark: "#082E5E",
      accent: "#E6EEF8",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#BBD4EE",
      sectionText: "#082E5E",
    },
    MCV: {
      primary: "#6E1424",
      primaryDark: "#3F0B16",
      accent: "#F6E7EA",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#E8C8CE",
      sectionText: "#3F0B16",
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
  "Programa administrado, operado y respaldado por: HOPE CONSULTING";

export const PAGE_SIZE_LETTER = { width: 612, height: 792 } as const;
