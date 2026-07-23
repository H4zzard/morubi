// Observabilidade da extensão (side panel). Inerte se WXT_SENTRY_DSN não estiver
// setado — nenhum overhead nem envio quando não configurado.
import * as Sentry from "@sentry/browser";

let started = false;

export function initSentry() {
  if (started) return;
  const dsn = import.meta.env.WXT_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    // A extensão roda em várias abas; amostra baixa evita ruído.
    tracesSampleRate: 0,
    environment: import.meta.env.MODE,
  });
  started = true;
}

export function captureError(err: unknown) {
  if (started) Sentry.captureException(err);
}
