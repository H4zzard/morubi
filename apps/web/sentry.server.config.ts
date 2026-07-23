// Sentry no runtime Node (rotas de API). Inerte se SENTRY_DSN não estiver setado.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Não capturar corpos/headers por padrão (dados de conversa são sensíveis).
    sendDefaultPii: false,
  });
}
