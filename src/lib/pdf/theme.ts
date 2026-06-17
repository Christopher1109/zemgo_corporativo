// Shared visual constants for all generated PDFs.
// Colors are aligned with the 3 program brands (ABC verde, FutCare azul, MCV vino)
// and HIR Seguros for the medical pass.

export const PDF_THEME = {
  programs: {
    ABC: {
      primary: "#1B7F3A", // verde
      primaryDark: "#0F5224",
      accent: "#E8F5EC",
      textOnPrimary: "#FFFFFF",
    },
    FUTCARE: {
      primary: "#0F4C9C", // azul
      primaryDark: "#082E5E",
      accent: "#E6EEF8",
      textOnPrimary: "#FFFFFF",
    },
    MCV: {
      primary: "#6E1424", // vino
      primaryDark: "#3F0B16",
      accent: "#F6E7EA",
      textOnPrimary: "#FFFFFF",
    },
  },
  hir: {
    primary: "#0B2E63", // azul oscuro HIR
    accent: "#F58220",  // naranja HIR (círculos / barras)
    warning: "#FFD400",
    textPrimary: "#1A1A1A",
    textMuted: "#555555",
    border: "#CCCCCC",
  },
  common: {
    pageBg: "#FFFFFF",
    text: "#1A1A1A",
    muted: "#666666",
    border: "#D0D0D0",
    softBorder: "#E5E5E5",
    footerBg: "#222222",
    footerText: "#FFFFFF",
  },
} as const;

export type ProgramCode = keyof typeof PDF_THEME.programs;

export function programPalette(code: string): typeof PDF_THEME.programs.ABC {
  const upper = (code ?? "").toUpperCase() as ProgramCode;
  return PDF_THEME.programs[upper] ?? PDF_THEME.programs.ABC;
}

// HOPE footer line, identical across the 3 certificates.
export const HOPE_FOOTER =
  "Programa administrado, operado y respaldado por: HOPE CONSULTING";

// Letter size in points (used implicitly via <Page size="LETTER" />).
export const PAGE_SIZE_LETTER = { width: 612, height: 792 } as const;
