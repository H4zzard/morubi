// Cálculo dos agregados do dashboard — usado pelo route handler E pela página SSR.
import { prisma, type Prisma } from "@morubi/db";
import {
  SELLER_MISTAKE_LABEL,
  type MetricsOverview,
  type SellerMistake,
} from "@morubi/api-client";
import { generateManagerInsight } from "@morubi/ai";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sem resposta há mais que isso = lead esfriando. */
const STALE_DAYS = 2;
/** Probabilidade a partir da qual o lead é considerado "quente". */
const HOT_THRESHOLD = 70;

// "Taxa de conversão" = ganhas sobre o TOTAL de conversas (não só as fechadas)
// — senão 1 ganha em 6 conversas (5 ainda em aberto) mostraria 100%.
function winRate(won: number, total: number): number {
  return total === 0 ? 0 : Math.round((won / total) * 100);
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export interface OverviewScope {
  role: "GESTOR" | "VENDEDOR";
  userId: string;
  tenantId: string;
  /** Insight custa uma chamada de LLM: só na página do gestor, não no polling. */
  withInsight?: boolean;
  tenantName?: string;
}

export async function computeOverview(scope: OverviewScope): Promise<MetricsOverview> {
  const where: Prisma.ConversationWhereInput =
    scope.role === "GESTOR" ? { tenantId: scope.tenantId } : { userId: scope.userId };

  const now = Date.now();

  const conversations = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      userId: true,
      outcome: true,
      dealValue: true,
      leadName: true,
      externalKey: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
      suggestions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { probability: true, objection: true, mistakes: true },
      },
    },
  });

  const won = conversations.filter((c) => c.outcome === "GANHA").length;
  const lost = conversations.filter((c) => c.outcome === "PERDIDA").length;
  const open = conversations.filter((c) => c.outcome === "EM_ABERTO").length;
  const total = conversations.length;

  // --- Probabilidade média das conversas em aberto ---
  const openWithProb = conversations.filter(
    (c) => c.outcome === "EM_ABERTO" && c.suggestions[0],
  );
  const avgProbability =
    openWithProb.length === 0
      ? 0
      : Math.round(
          openWithProb.reduce((s, c) => s + (c.suggestions[0]?.probability ?? 0), 0) /
            openWithProb.length,
        );

  // --- Tendência: últimos 7 dias vs. os 7 anteriores ---
  const last7 = conversations.filter((c) => now - c.createdAt.getTime() <= 7 * DAY_MS);
  const prev7 = conversations.filter((c) => {
    const age = now - c.createdAt.getTime();
    return age > 7 * DAY_MS && age <= 14 * DAY_MS;
  });
  const winRateLast7 = winRate(last7.filter((c) => c.outcome === "GANHA").length, last7.length);
  const winRatePrev7 = winRate(prev7.filter((c) => c.outcome === "GANHA").length, prev7.length);
  const winRateTrend = winRateLast7 - winRatePrev7;

  // Série diária da conversão (7 pontos) para o sparkline.
  const winRateSeries: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const start = now - (d + 1) * DAY_MS;
    const end = now - d * DAY_MS;
    const dayConvs = conversations.filter(
      (c) => c.createdAt.getTime() > start && c.createdAt.getTime() <= end,
    );
    winRateSeries.push(
      winRate(dayConvs.filter((c) => c.outcome === "GANHA").length, dayConvs.length),
    );
  }

  // --- Receita projetada: dealValue ponderado pela probabilidade (só em aberto) ---
  const projectedRevenue = conversations
    .filter((c) => c.outcome === "EM_ABERTO")
    .reduce((sum, c) => {
      const prob = c.suggestions[0]?.probability ?? 0;
      return sum + Math.round(((c.dealValue ?? 0) * prob) / 100);
    }, 0);
  const wonRevenueLast7 = last7
    .filter((c) => c.outcome === "GANHA")
    .reduce((s, c) => s + (c.dealValue ?? 0), 0);
  const wonRevenuePrev7 = prev7
    .filter((c) => c.outcome === "GANHA")
    .reduce((s, c) => s + (c.dealValue ?? 0), 0);
  const projectedRevenueTrend =
    wonRevenuePrev7 === 0
      ? wonRevenueLast7 > 0
        ? 100
        : 0
      : Math.round(((wonRevenueLast7 - wonRevenuePrev7) / wonRevenuePrev7) * 100);

  // --- Leads quentes ---
  const openConvs = conversations.filter((c) => c.outcome === "EM_ABERTO");
  const hot = openConvs.filter((c) => (c.suggestions[0]?.probability ?? 0) >= HOT_THRESHOLD);
  const hotLeadsNew = hot.filter((c) => now - c.createdAt.getTime() <= DAY_MS).length;
  const highIntentPct = pct(
    openConvs.filter((c) => (c.suggestions[0]?.probability ?? 0) >= 80).length,
    openConvs.length,
  );
  const negotiatingPct = pct(
    openConvs.filter((c) => {
      const p = c.suggestions[0]?.probability ?? 0;
      return p >= 40 && p < 80;
    }).length,
    openConvs.length,
  );

  // --- Vendas em risco: em aberto, com objeção aberta OU paradas há dias ---
  const atRisk = openConvs.filter((c) => {
    const stale = now - c.updatedAt.getTime() > STALE_DAYS * DAY_MS;
    const hasObjection = !!c.suggestions[0]?.objection;
    return stale || hasObjection;
  });
  const atRiskRevenue = atRisk.reduce((s, c) => s + (c.dealValue ?? 0), 0);
  const openObjections = openConvs.filter((c) => !!c.suggestions[0]?.objection).length;

  const atRiskLeads = atRisk
    .map((c) => {
      const daysIdle = Math.floor((now - c.updatedAt.getTime()) / DAY_MS);
      const objection = c.suggestions[0]?.objection;
      const reason =
        daysIdle >= STALE_DAYS
          ? `Sem resposta há ${daysIdle} dia${daysIdle > 1 ? "s" : ""}`
          : objection
            ? "Objeção em aberto"
            : "Em risco";
      return {
        conversationId: c.id,
        leadName: c.leadName ?? c.externalKey ?? "Lead sem nome",
        reason,
        probability: c.suggestions[0]?.probability ?? 0,
      };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);

  // --- Erros mais comuns (sobre as análises mais recentes de cada conversa) ---
  const mistakeCounts = new Map<SellerMistake, number>();
  let analysesWithMistakeData = 0;
  for (const c of conversations) {
    const s = c.suggestions[0];
    if (!s) continue;
    analysesWithMistakeData += 1;
    for (const m of s.mistakes as SellerMistake[]) {
      mistakeCounts.set(m, (mistakeCounts.get(m) ?? 0) + 1);
    }
  }
  const commonMistakes = [...mistakeCounts.entries()]
    .map(([mistake, count]) => ({
      mistake,
      label: SELLER_MISTAKE_LABEL[mistake] ?? mistake,
      count,
      pct: pct(count, analysesWithMistakeData),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- Por vendedor ---
  const bySeller = new Map<
    string,
    { name: string; total: number; won: number; lost: number; wonPrev: number; active: boolean }
  >();
  for (const c of conversations) {
    const entry =
      bySeller.get(c.userId) ??
      { name: c.user.name, total: 0, won: 0, lost: 0, wonPrev: 0, active: false };
    entry.total += 1;
    if (c.outcome === "GANHA") {
      if (now - c.createdAt.getTime() <= 7 * DAY_MS) entry.won += 1;
      else if (now - c.createdAt.getTime() <= 14 * DAY_MS) entry.wonPrev += 1;
    }
    if (c.outcome === "PERDIDA") entry.lost += 1;
    if (now - c.updatedAt.getTime() <= DAY_MS) entry.active = true;
    bySeller.set(c.userId, entry);
  }

  const totalWonBySeller = new Map<string, number>();
  for (const c of conversations) {
    if (c.outcome === "GANHA") {
      totalWonBySeller.set(c.userId, (totalWonBySeller.get(c.userId) ?? 0) + 1);
    }
  }

  const perSeller = [...bySeller.entries()]
    .map(([userId, e]) => ({
      userId,
      name: e.name,
      totalConversations: e.total,
      won: totalWonBySeller.get(userId) ?? 0,
      lost: e.lost,
      winRate: winRate(totalWonBySeller.get(userId) ?? 0, e.total),
      trend: e.won - e.wonPrev,
      active: e.active,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  // --- Equipe ---
  const teamTotal =
    scope.role === "GESTOR"
      ? await prisma.user.count({ where: { tenantId: scope.tenantId } })
      : 1;
  const activitySeries: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const start = now - (d + 1) * DAY_MS;
    const end = now - d * DAY_MS;
    activitySeries.push(
      conversations.filter(
        (c) => c.updatedAt.getTime() > start && c.updatedAt.getTime() <= end,
      ).length,
    );
  }

  // --- Insight do Morubi (só para o gestor, sob demanda) ---
  let insight: string | null = null;
  if (scope.withInsight && scope.role === "GESTOR") {
    insight = await generateManagerInsight({
      tenantName: scope.tenantName ?? "a empresa",
      totalConversations: total,
      won,
      lost,
      open,
      winRate: winRate(won, total),
      avgProbability,
      topMistakes: commonMistakes.map((m) => ({ label: m.label, pct: m.pct })),
      sellers: perSeller.map((s) => ({
        name: s.name,
        winRate: s.winRate,
        total: s.totalConversations,
      })),
    });
  }

  return {
    macro: {
      totalConversations: total,
      won,
      lost,
      open,
      winRate: winRate(won, total),
      winRateTrend,
      avgProbability,
      winRateSeries,
      projectedRevenue,
      projectedRevenueTrend,
      hotLeads: hot.length,
      hotLeadsNew,
      highIntentPct,
      negotiatingPct,
      atRiskRevenue,
      atRiskDeals: atRisk.length,
      openObjections,
    },
    perSeller,
    commonMistakes,
    atRiskLeads,
    team: {
      online: perSeller.filter((s) => s.active).length,
      total: teamTotal,
      activitySeries,
    },
    insight,
  };
}
