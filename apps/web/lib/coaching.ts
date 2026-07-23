// Geração dos relatórios de coaching por vendedor.
// Compartilhado entre a rota manual ("gerar agora") e o cron agendado, para a
// lógica existir num lugar só.
import { prisma } from "@morubi/db";
import { generateSellerCoaching, type CoachingConversationInput } from "@morubi/ai";
import type { CoachingReportDTO } from "@morubi/api-client";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Janela analisada por relatório. */
export const COACHING_PERIOD_DAYS = 7;
/** Quantas mensagens de cada conversa entram na transcrição enviada à IA. */
const TRANSCRIPT_MESSAGES = 14;
/** Teto de conversas por vendedor, para não estourar o contexto/custo. */
const MAX_CONVERSATIONS_PER_SELLER = 12;

export function toReportDTO(r: {
  id: string;
  userId: string;
  userName: string;
  periodStart: Date;
  periodEnd: Date;
  content: string;
  conversationsAnalyzed: number;
  source: string;
  createdAt: Date;
}): CoachingReportDTO {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    content: r.content,
    conversationsAnalyzed: r.conversationsAnalyzed,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Gera (e persiste) um relatório de coaching para CADA vendedor do tenant,
 * cobrindo os últimos COACHING_PERIOD_DAYS dias.
 */
export async function generateCoachingForTenant(
  tenantId: string,
  source: "manual" | "auto",
): Promise<CoachingReportDTO[]> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - COACHING_PERIOD_DAYS * DAY_MS);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) return [];

  // Coaching é sobre quem atende: só vendedores.
  const sellers = await prisma.user.findMany({
    where: { tenantId, role: "VENDEDOR" },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const out: CoachingReportDTO[] = [];

  for (const seller of sellers) {
    const conversations = await prisma.conversation.findMany({
      where: { tenantId, userId: seller.id, updatedAt: { gte: periodStart } },
      orderBy: { updatedAt: "desc" },
      take: MAX_CONVERSATIONS_PER_SELLER,
      select: {
        leadName: true,
        externalKey: true,
        outcome: true,
        messages: {
          orderBy: { timestamp: "desc" },
          take: TRANSCRIPT_MESSAGES,
          select: { sender: true, content: true },
        },
        suggestions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { probability: true, mistakes: true },
        },
      },
    });

    const input: CoachingConversationInput[] = conversations.map((c) => ({
      leadLabel: c.externalKey ?? c.leadName ?? "lead sem identificação",
      outcome: c.outcome,
      lastProbability: c.suggestions[0]?.probability ?? null,
      mistakes: (c.suggestions[0]?.mistakes as string[] | undefined) ?? [],
      transcript: c.messages
        .slice()
        .reverse()
        .map((m) => `${m.sender === "CLIENTE" ? "CLIENTE" : "VENDEDOR"}: ${m.content}`)
        .join("\n"),
    }));

    let content: string;
    try {
      content = await generateSellerCoaching({
        sellerName: seller.name,
        companyName: tenant.name,
        periodLabel: `nos últimos ${COACHING_PERIOD_DAYS} dias`,
        conversations: input,
      });
    } catch (err) {
      // Um vendedor que falha não pode derrubar o relatório dos outros.
      console.error(`[coaching] falha ao gerar para ${seller.name}:`, err);
      continue;
    }

    const saved = await prisma.coachingReport.create({
      data: {
        tenantId,
        userId: seller.id,
        userName: seller.name,
        periodStart,
        periodEnd,
        content,
        conversationsAnalyzed: input.length,
        source,
      },
    });
    out.push(toReportDTO(saved));
  }

  return out;
}
