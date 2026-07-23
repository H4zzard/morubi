import { AnalyzeRequestSchema, type AnalyzeResponse } from "@morubi/api-client";
import { prisma, saveContactMemory } from "@morubi/db";
import { analyzeConversation, type RecentMessage } from "@morubi/ai";
import { requireUser } from "@/lib/auth";
import { requireOwnedConversation } from "@/lib/conversation";
import { ok, handle } from "@/lib/api-response";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = () => corsPreflight();

/**
 * Endpoint central do copiloto: RAG + memória do contato + 1 chamada estruturada
 * à LLM. Persiste a Suggestion e ATUALIZA a memória evolutiva do contato, para
 * que a próxima retomada da conversa continue de onde parou em vez de reiniciar.
 */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireUser(req);
    rateLimit(`analyze:${ctx.user.id}`, LIMITS.analyze.limit, LIMITS.analyze.windowMs);
    const { id } = await params;
    const conversation = await requireOwnedConversation(id, ctx);

    const input = AnalyzeRequestSchema.parse(await req.json().catch(() => ({})));
    const extraMessages: RecentMessage[] | undefined = input.recentMessages?.map((m) => ({
      sender: m.sender,
      type: m.type,
      content: m.content,
      timestamp: new Date(m.timestamp),
    }));

    const { analysis, citedKnowledge, previousAnalysisCount } = await analyzeConversation({
      conversationId: id,
      tenantId: conversation.tenantId,
      userId: conversation.userId,
      channel: conversation.channel,
      externalKey: conversation.externalKey,
      extraMessages,
    });

    const suggestion = await prisma.suggestion.create({
      data: {
        conversationId: id,
        stage: analysis.stage,
        probability: analysis.probability,
        nextAction: analysis.nextAction,
        objection: analysis.objection,
        objectionReply: analysis.objectionReply,
        mistakes: analysis.mistakes,
      },
    });

    // Memória evolutiva do contato (best-effort: não derruba a análise).
    let memoryAnalysisCount = previousAnalysisCount + 1;
    if (conversation.externalKey) {
      try {
        memoryAnalysisCount = await saveContactMemory({
          tenantId: conversation.tenantId,
          channel: conversation.channel,
          externalKey: conversation.externalKey,
          leadName: conversation.leadName,
          summary: analysis.memorySummary,
          keyFacts: analysis.memoryKeyFacts,
        });
      } catch (err) {
        console.error("[analyze] falha ao salvar memória do contato:", err);
      }
    }

    const body: AnalyzeResponse = {
      ...analysis,
      suggestionId: suggestion.id,
      citedKnowledge,
      memoryAnalysisCount,
    };
    return ok(body);
  });
}
