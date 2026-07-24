// Orquestração da análise do copiloto: contexto (RAG + memória) -> 1 chamada estruturada.
import { AnalysisSchema, type Analysis } from "@morubi/api-client";
import { rethrowLlmError } from "./config";
import { llmObject } from "./llm";
import { buildAnalysisContext, type RecentMessage } from "./rag";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "./prompts";
import { stripDashesDeep } from "./sanitize";

export interface AnalyzeResult {
  analysis: Analysis;
  citedKnowledge: { title: string }[];
  /** Quantas análises este contato já acumulou ANTES desta. */
  previousAnalysisCount: number;
}

/**
 * Endpoint central do copiloto (lado IA). Uma única chamada estruturada
 * retorna estágio + probabilidade + próxima ação + objeção + erros + memória
 * atualizada. Não persiste nada (a rota grava Suggestion e ContactMemory) para
 * manter as escritas de banco na camada de API.
 */
export async function analyzeConversation(params: {
  conversationId: string;
  tenantId: string;
  userId: string;
  channel?: string;
  externalKey?: string | null;
  extraMessages?: RecentMessage[];
}): Promise<AnalyzeResult> {
  const ctx = await buildAnalysisContext(params);

  const object = await llmObject({
    schema: AnalysisSchema,
    system: SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(ctx),
  }).catch(rethrowLlmError);

  return {
    // Rede de segurança: o modelo volta a usar travessão sob pressão de contexto.
    analysis: stripDashesDeep(object),
    citedKnowledge: ctx.knowledge.map((k) => ({ title: k.title })),
    previousAnalysisCount: ctx.memory?.analysisCount ?? 0,
  };
}
