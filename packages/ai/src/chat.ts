// Chat livre do vendedor com o Morubi dentro do side panel.
// Além de tirar dúvidas, é o canal de CORREÇÃO: a IA identifica quando a
// mensagem do vendedor a está corrigindo e devolve a correção estruturada,
// que a rota persiste como `Correction` (memória evolutiva).
import { z } from "zod";
import { rethrowLlmError } from "./config";
import { llmObject } from "./llm";
import { buildAnalysisContext, type RecentMessage } from "./rag";
import { buildChatPrompt, CHAT_SYSTEM_PROMPT } from "./prompts";
import { stripDashesDeep } from "./sanitize";

const ChatReplySchema = z.object({
  reply: z.string(),
  isCorrection: z.boolean(),
  correctionOriginal: z.string().nullable(),
  correctionCorrected: z.string().nullable(),
});

export interface CopilotChatResult {
  reply: string;
  correction: { original: string; corrected: string } | null;
}

export async function chatWithCopilot(params: {
  conversationId: string;
  tenantId: string;
  userId: string;
  channel?: string;
  externalKey?: string | null;
  message: string;
  history: { role: "VENDEDOR" | "ASSISTENTE"; content: string }[];
  lastSuggestion: { nextAction: string; probability: number } | null;
  extraMessages?: RecentMessage[];
}): Promise<CopilotChatResult> {
  const ctx = await buildAnalysisContext(params);

  const object = await llmObject({
    schema: ChatReplySchema,
    system: CHAT_SYSTEM_PROMPT,
    prompt: buildChatPrompt({
      ctx,
      history: params.history,
      lastSuggestion: params.lastSuggestion,
      message: params.message,
    }),
  }).catch(rethrowLlmError);

  const clean = stripDashesDeep(object);

  const correction =
    clean.isCorrection && clean.correctionOriginal && clean.correctionCorrected
      ? { original: clean.correctionOriginal, corrected: clean.correctionCorrected }
      : null;

  return { reply: clean.reply, correction };
}
