// Contrato interno do motor de geração. Existe para que trocar de provedor
// (API paga x CLI da assinatura x mock) não toque nenhum arquivo de negócio.
import type { z } from "zod";

// Genérico sobre o schema, não sobre o tipo: schemas com `.default()` têm
// tipo de entrada diferente do de saída, e `z.infer` sempre pega a saída —
// que é o que o chamador realmente recebe.
export interface LlmObjectParams<S extends z.ZodTypeAny> {
  schema: S;
  system: string;
  prompt: string;
}

export interface LlmTextParams {
  system: string;
  prompt: string;
}

/**
 * Um driver de geração. `object` devolve dado já validado pelo Zod; `text`
 * devolve texto livre. É deliberadamente menor que o AI SDK: só o que os
 * quatro pontos de chamada de packages/ai realmente usam.
 */
export interface LlmDriver {
  object<S extends z.ZodTypeAny>(params: LlmObjectParams<S>): Promise<z.infer<S>>;
  text(params: LlmTextParams): Promise<string>;
}

/**
 * - `api`  — Anthropic via ANTHROPIC_API_KEY (padrão; único caminho de produção).
 * - `cli`  — Claude Code CLI local, autenticado pela assinatura. Dev/teste.
 * - `mock` — respostas fixas, sem rede e sem custo. Para mexer em UI e fluxo.
 */
export type LlmProviderName = "api" | "cli" | "mock";
