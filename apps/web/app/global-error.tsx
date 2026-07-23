"use client";

// Boundary global de erro (App Router). Reporta erros de renderização do React
// ao Sentry (inerte sem DSN) e mostra uma tela de erro amigável em vez de branco.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          background: "#0B0F0E",
          color: "#F4F6F5",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 380, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: 14, color: "#AAB4B0", margin: "0 0 20px", lineHeight: 1.5 }}>
            Tivemos um problema ao carregar esta tela. Já registramos o erro. Tente de novo.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#12B866",
              color: "#0B0F0E",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
