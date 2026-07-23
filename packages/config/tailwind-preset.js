// Preset Tailwind compartilhado entre web e extensão.
// A fonte única das cores/tokens é @morubi/ui-tokens — não redeclare hex aqui.
import { colors, radii, fontFamily } from "@morubi/ui-tokens";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors,
      borderRadius: radii,
      fontFamily,
    },
  },
  plugins: [],
};
