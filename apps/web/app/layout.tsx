import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morubi — Gerente comercial de IA",
  description: "Acompanhe suas vendas em tempo real e feche mais.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
