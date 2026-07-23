import type { Config } from "tailwindcss";
import preset from "@morubi/config/tailwind-preset";

export default {
  presets: [preset],
  content: ["./entrypoints/**/*.{ts,tsx,html}", "./components/**/*.{ts,tsx}"],
} satisfies Config;
