// Bootstrap de instrumentação do Next.js. Carrega a config do Sentry conforme
// o runtime e expõe o hook de erro de request. Tudo inerte sem SENTRY_DSN.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
