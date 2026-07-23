// Modelos e constantes do motor de IA — um único lugar para trocar de modelo.
export const AI_CONFIG = {
  // Geração/raciocínio: Anthropic Claude (único provedor de geração).
  generationModel: "claude-sonnet-5",
  // Embeddings: Google Gemini (Anthropic não oferece embeddings).
  // outputDimensionality=1536 mantém compatível com a coluna pgvector existente.
  embeddingModel: "gemini-embedding-001",
  embeddingDimensions: 1536,
  // Transcrição: Google Gemini multimodal (áudio -> texto).
  transcriptionModel: "gemini-2.5-flash",
  // RAG
  ragTopK: 5,
  // Quantas mensagens recentes entram no prompt de análise.
  recentMessageWindow: 20,
  // Teto de tempo para uma chamada de LLM. Abaixo do maxDuration (60s) das
  // rotas, para falhar de forma limpa em vez de a Vercel matar a função.
  llmTimeoutMs: 45_000,
} as const;

/**
 * Erro de provedor de IA já traduzido para uma mensagem que o usuário entende.
 * Sem isso, falhas como "sem crédito" chegam ao vendedor como "Erro interno",
 * o que faz parecer bug do produto quando é conta/config.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    public status: 429 | 502 | 503 = 502,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Erro amigável quando a LLM demora demais (ou é abortada). */
export class LlmTimeoutError extends LlmError {
  constructor() {
    super("A IA demorou demais para responder. Tente novamente.", 503);
    this.name = "LlmTimeoutError";
  }
}

/** Sinal de abort com timeout padrão das chamadas de LLM. */
export function llmAbortSignal(): AbortSignal {
  return AbortSignal.timeout(AI_CONFIG.llmTimeoutMs);
}

/**
 * Traduz erros do provedor de IA em mensagens acionáveis; repassa o que não
 * reconhecer (para não mascarar bug de verdade).
 */
export function rethrowLlmError(err: unknown): never {
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (name === "TimeoutError" || name === "AbortError" || msg.includes("abort")) {
    throw new LlmTimeoutError();
  }
  if (msg.includes("credit balance") || msg.includes("billing") || msg.includes("quota")) {
    throw new LlmError(
      "A conta de IA está sem crédito. Recarregue o saldo para voltar a analisar.",
      502,
    );
  }
  if (
    msg.includes("api key") ||
    msg.includes("unauthorized") ||
    msg.includes("authentication") ||
    msg.includes("invalid x-api-key")
  ) {
    throw new LlmError("A chave da API de IA está inválida ou ausente.", 502);
  }
  if (msg.includes("rate limit") || msg.includes("overloaded") || msg.includes("529")) {
    throw new LlmError("A IA está sobrecarregada agora. Tente de novo em instantes.", 429);
  }
  throw err;
}
