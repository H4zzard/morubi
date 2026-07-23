// Insight agregado do time para o dashboard do gestor.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { AI_CONFIG, llmAbortSignal } from "./config";
import { INSIGHT_SYSTEM_PROMPT } from "./prompts";
import { stripDashes } from "./sanitize";

export interface InsightInput {
  tenantName: string;
  totalConversations: number;
  won: number;
  lost: number;
  open: number;
  winRate: number;
  avgProbability: number;
  /** Erros mais comuns já agregados: label + % das análises. */
  topMistakes: { label: string; pct: number }[];
  /** Conversão por vendedor, para apontar dispersão no time. */
  sellers: { name: string; winRate: number; total: number }[];
}

/** Gera o texto do card "Insight do Morubi". Retorna null se não houver base. */
export async function generateManagerInsight(input: InsightInput): Promise<string | null> {
  if (input.totalConversations === 0) return null;

  const mistakes =
    input.topMistakes.length > 0
      ? input.topMistakes.map((m) => `- ${m.label}: ${m.pct}% das análises`).join("\n")
      : "(nenhum erro recorrente detectado ainda)";

  const sellers =
    input.sellers.length > 0
      ? input.sellers
          .map((s) => `- ${s.name}: ${s.winRate}% de conversão em ${s.total} conversas`)
          .join("\n")
      : "(sem dados por vendedor)";

  const prompt = `Empresa: ${input.tenantName}

NÚMEROS DO TIME
- Conversas: ${input.totalConversations} (${input.won} ganhas, ${input.lost} perdidas, ${input.open} em aberto)
- Conversão: ${input.winRate}%
- Probabilidade média das conversas em aberto: ${input.avgProbability}%

ERROS MAIS COMUNS DETECTADOS
${mistakes}

CONVERSÃO POR VENDEDOR
${sellers}

Gere o insight para o gestor.`;

  try {
    const { text } = await generateText({
      model: anthropic(AI_CONFIG.generationModel),
      system: INSIGHT_SYSTEM_PROMPT,
      prompt,
      abortSignal: llmAbortSignal(),
    });
    const clean = stripDashes(text.trim());
    return clean || null;
  } catch (err) {
    // Insight é enfeite do dashboard: nunca deve derrubar a página.
    console.error("[ai] falha ao gerar insight do gestor:", err);
    return null;
  }
}
