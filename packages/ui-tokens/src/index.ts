// ============================================================================
// Morubi — Design Tokens (fonte ÚNICA de identidade visual)
// Usado por apps/web e apps/extension via o preset Tailwind em @morubi/config.
// Identidade: graphite escuro + verde de destaque (mesma da landing).
// Não redeclare estas cores em nenhum outro lugar.
// ============================================================================

export const colors = {
  // Superfícies (graphite)
  graphite: {
    950: "#0B0F0E",
    900: "#101614",
    800: "#161D1B",
    700: "#1E2724",
    600: "#2A3531",
    500: "#3A4742",
  },
  // Verde de destaque (accent / marca)
  brand: {
    50: "#E9FBF1",
    100: "#C9F5DD",
    200: "#94EBBC",
    300: "#5FE09B",
    400: "#2FD47C",
    500: "#12B866", // cor principal
    600: "#0E9A55",
    700: "#0B7A43",
    800: "#085C33",
    900: "#053D22",
  },
  // Texto / bordas neutras
  ink: {
    100: "#F4F6F5",
    200: "#D7DEDB",
    300: "#AAB4B0",
    400: "#7C8783",
    500: "#586B64",
  },
  // Estados
  success: "#12B866",
  warning: "#E0B400",
  danger: "#E05353",
  info: "#3B9AE0",
} as const;

export const radii = {
  none: "0px",
  sm: "0.375rem",
  DEFAULT: "0.5rem",
  md: "0.625rem",
  lg: "0.875rem",
  xl: "1.25rem",
  full: "9999px",
} as const;

export const fontFamily = {
  sans: [
    "Inter",
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
  mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
} as const;

// Escala semântica de probabilidade de fechamento (usada no copiloto).
export function probabilityColor(probability: number): string {
  if (probability >= 70) return colors.brand[500];
  if (probability >= 40) return colors.warning;
  return colors.danger;
}
