// Cliente Prisma ÚNICO exportado para todo o monorepo (singleton em dev).
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Reexporta tipos e enums gerados — nenhum outro pacote importa "@prisma/client" direto.
export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";

// --- Helpers de embedding (o ÚNICO lugar com SQL cru de vetor no código) ---

/** Grava/atualiza o embedding de um KnowledgeItem via pgvector. */
export async function setKnowledgeEmbedding(id: string, embedding: number[]): Promise<void> {
  const vec = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`
    UPDATE "KnowledgeItem" SET "embedding" = ${vec}::vector WHERE "id" = ${id}
  `;
}

export interface KnowledgeMatch {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

/** Busca top-K trechos da base de conhecimento de um tenant por similaridade. */
export async function matchKnowledge(
  embedding: number[],
  tenantId: string,
  matchCount = 5,
): Promise<KnowledgeMatch[]> {
  const vec = `[${embedding.join(",")}]`;
  // Prisma envia number como bigint por padrão; a função SQL espera `int`,
  // então o cast explícito evita erro de overload (42883) no Postgres.
  return prisma.$queryRaw<KnowledgeMatch[]>`
    SELECT * FROM match_knowledge(${vec}::vector, ${tenantId}, ${matchCount}::int)
  `;
}

// --- Memória evolutiva por contato ---

/**
 * Grava a memória do contato acumulando (incrementa o contador de análises).
 * Chamado após cada /analyze — a IA devolve a versão já mesclada do resumo.
 */
export async function saveContactMemory(params: {
  tenantId: string;
  channel: string;
  externalKey: string;
  leadName?: string | null;
  summary: string;
  keyFacts: string[];
}): Promise<number> {
  const { tenantId, channel, externalKey, leadName, summary, keyFacts } = params;
  const row = await prisma.contactMemory.upsert({
    where: { tenantId_channel_externalKey: { tenantId, channel, externalKey } },
    update: {
      summary,
      keyFacts,
      leadName: leadName ?? undefined,
      analysisCount: { increment: 1 },
    },
    create: {
      tenantId,
      channel,
      externalKey,
      leadName: leadName ?? null,
      summary,
      keyFacts,
      analysisCount: 1,
    },
    select: { analysisCount: true },
  });
  return row.analysisCount;
}

/** Quantas análises já existem para este contato (0 se nunca analisado). */
export async function getContactMemoryCount(params: {
  tenantId: string;
  channel: string;
  externalKey: string | null;
}): Promise<number> {
  if (!params.externalKey) return 0;
  const row = await prisma.contactMemory.findUnique({
    where: {
      tenantId_channel_externalKey: {
        tenantId: params.tenantId,
        channel: params.channel,
        externalKey: params.externalKey,
      },
    },
    select: { analysisCount: true },
  });
  return row?.analysisCount ?? 0;
}
