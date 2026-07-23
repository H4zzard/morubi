// ============================================================================
// Rate limiting simples (janela fixa em memória, por chave).
//
// Objetivo: primeira linha de defesa contra loops da extensão e contra gasto
// descontrolado de crédito de LLM. Limites GENEROSOS: uso normal nunca encosta;
// só um cliente travado em loop é barrado.
//
// Limitação conhecida: o contador é POR INSTÂNCIA (não é compartilhado entre as
// instâncias serverless da Vercel). É suficiente para dev e para uma empresa
// testando, e serve de barreira básica em prod. Para um limite forte e global,
// trocar o Map por Upstash/Redis mantendo a mesma assinatura de `rateLimit()`.
// ============================================================================

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.");
    this.name = "RateLimitError";
  }
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Faz faxina no máximo a cada 60s para não crescer indefinidamente.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(key);
  }
}

/**
 * Consome 1 do orçamento de `key`. Lança RateLimitError se estourar `limit`
 * dentro de `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  sweep(now);

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (b.count >= limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((b.resetAt - now) / 1000)));
  }
  b.count += 1;
}

/** Limites por rota (por usuário). Ajuste aqui se precisar. */
export const LIMITS = {
  analyze: { limit: 30, windowMs: 60_000 },
  chat: { limit: 30, windowMs: 60_000 },
  transcribe: { limit: 20, windowMs: 60_000 },
} as const;
