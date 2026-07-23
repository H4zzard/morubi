// Helpers de resposta JSON + tratamento de erro padronizado para Route Handlers.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { LlmError } from "@morubi/ai";
import { AuthError } from "./auth";
import { RateLimitError } from "./rate-limit";
import { withCors } from "./cors";

export function ok<T>(data: T, status = 200) {
  return withCors(NextResponse.json(data, { status }));
}

export function fail(message: string, status = 400, details?: unknown) {
  return withCors(NextResponse.json({ error: message, details }, { status }));
}

/**
 * Envolve um handler traduzindo AuthError/ZodError/RateLimitError em respostas
 * JSON limpas. Erros inesperados (500) vão para o Sentry (inerte sem DSN).
 */
export function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return fn().catch((err) => {
    if (err instanceof AuthError) return fail(err.message, err.status);
    if (err instanceof ZodError) return fail("Dados inválidos", 422, err.flatten());
    if (err instanceof RateLimitError) {
      const res = fail(err.message, 429);
      res.headers.set("Retry-After", String(err.retryAfterSeconds));
      return res;
    }
    // Problema do provedor de IA (sem crédito, chave inválida, sobrecarga):
    // é config/conta, não bug. Mostra a causa em vez de "Erro interno".
    if (err instanceof LlmError) {
      console.error("[api] provedor de IA:", err.message);
      return fail(err.message, err.status);
    }
    console.error("[api] erro não tratado:", err);
    Sentry.captureException(err);
    return fail("Erro interno", 500);
  });
}
