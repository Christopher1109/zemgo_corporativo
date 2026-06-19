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
      // Matches certificate sample: bright leaf-green header/footer with pale green section bars.
      primary: "#7CB342",
      primaryDark: "#558B2F",
      accent: "#DCEDC8",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#AED581",
      sectionText: "#1B5E20",
    },
    FUTCARE: {
      // Matches certificate sample: deep navy header/footer with white text on section bars.
      primary: "#1B2A55",
      primaryDark: "#101A39",
      accent: "#E8ECF7",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#1B2A55",
      sectionText: "#FFFFFF",
    },
    MCV: {
      // Matches certificate sample: dusty maroon/rosewood, section bars filled with brand color.
      primary: "#A23B5C",
      primaryDark: "#7A2B45",
      accent: "#F4E1E7",
      textOnPrimary: "#FFFFFF",
      sectionBg: "#A23B5C",
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
  "Programa administrado, operado y respaldado por: HOPE CONSULTING";

export const PAGE_SIZE_LETTER = { width: 612, height: 792 } as const;
