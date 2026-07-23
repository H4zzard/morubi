// Recuperação de contexto para a análise: mensagens, base de conhecimento (pgvector)
// e correções ativas (memória evolutiva). Nada de LLM aqui — só coleta de contexto.
import { prisma, matchKnowledge, type KnowledgeMatch } from "@morubi/db";
import { AI_CONFIG } from "./config";
import { embed } from "./gemini";

export interface RecentMessage {
  sender: "cliente" | "vendedor";
  type: "texto" | "audio";
  content: string;
  timestamp: Date;
}

export interface ActiveCorrection {
  scope: "VENDEDOR" | "TENANT";
  original: string;
  corrected: string;
}

/** Memória evolutiva acumulada deste CONTATO (persiste entre conversas). */
export interface ContactMemorySnapshot {
  summary: string;
  keyFacts: string[];
  analysisCount: number;
}

export interface AnalysisContext {
  messages: RecentMessage[];
  knowledge: KnowledgeMatch[];
  corrections: ActiveCorrection[];
  memory: ContactMemorySnapshot | null;
}

/**
 * Monta todo o contexto para /analyze.
 * As correções do vendedor + do tenant têm prioridade e são recuperadas sempre.
 * A memória do contato entra para que a análise CONTINUE de onde parou em vez
 * de recomeçar do zero a cada retomada da conversa.
 */
export async function buildAnalysisContext(params: {
  conversationId: string;
  tenantId: string;
  userId: string;
  /** Canal + chave do contato, para carregar a memória evolutiva dele. */
  channel?: string;
  externalKey?: string | null;
  /** Mensagens ainda não persistidas (opcional) a acrescentar ao histórico. */
  extraMessages?: RecentMessage[];
}): Promise<AnalysisContext> {
  const { conversationId, tenantId, userId, channel, externalKey, extraMessages = [] } = params;

  // 1. Últimas N mensagens persistidas.
  const persisted = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: "desc" },
    take: AI_CONFIG.recentMessageWindow,
  });

  const messages: RecentMessage[] = [
    ...persisted
      .reverse()
      .map((m) => ({
        sender: (m.sender === "CLIENTE" ? "cliente" : "vendedor") as "cliente" | "vendedor",
        type: (m.type === "AUDIO" ? "audio" : "texto") as "texto" | "audio",
        content: m.content,
        timestamp: m.timestamp,
      })),
    ...extraMessages,
  ].slice(-AI_CONFIG.recentMessageWindow);

  // 2. Consulta RAG: usa as últimas mensagens do CLIENTE como consulta.
  const queryText =
    messages
      .filter((m) => m.sender === "cliente")
      .slice(-4)
      .map((m) => m.content)
      .join("\n") || messages.map((m) => m.content).join("\n");

  let knowledge: KnowledgeMatch[] = [];
  if (queryText.trim()) {
    try {
      const queryEmbedding = await embed(queryText, "RETRIEVAL_QUERY");
      knowledge = await matchKnowledge(queryEmbedding, tenantId, AI_CONFIG.ragTopK);
    } catch (err) {
      // RAG é best-effort: se embedding/consulta falhar, seguimos sem trechos.
      console.error("[ai] RAG falhou, seguindo sem base:", err);
    }
  }

  // 3. Correções ativas: do próprio vendedor (VENDEDOR) + promovidas do tenant (TENANT).
  const corrections = await prisma.correction.findMany({
    where: {
      tenantId,
      OR: [{ scope: "TENANT" }, { scope: "VENDEDOR", userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // 4. Memória evolutiva do contato (por tenant+canal+contato, não por conversa).
  let memory: ContactMemorySnapshot | null = null;
  if (channel && externalKey) {
    const row = await prisma.contactMemory.findUnique({
      where: { tenantId_channel_externalKey: { tenantId, channel, externalKey } },
    });
    if (row) {
      memory = {
        summary: row.summary,
        keyFacts: row.keyFacts,
        analysisCount: row.analysisCount,
      };
    }
  }

  return {
    messages,
    knowledge,
    corrections: corrections.map((c) => ({
      scope: c.scope,
      original: c.original,
      corrected: c.corrected,
    })),
    memory,
  };
}
