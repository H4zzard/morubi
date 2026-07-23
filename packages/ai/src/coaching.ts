// Relatório de coaching por vendedor, no estilo de um coordenador comercial.
// Recebe as conversas do vendedor no período e devolve feedback específico:
// o que está acertando, errando, e leads concretos para dar follow up.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { AI_CONFIG, llmAbortSignal, rethrowLlmError } from "./config";
import { stripDashes } from "./sanitize";

export interface CoachingConversationInput {
  /** Identificação do lead (telefone/nome) — para o relatório citar quem seguir. */
  leadLabel: string;
  outcome: "EM_ABERTO" | "GANHA" | "PERDIDA";
  lastProbability: number | null;
  /** Códigos de erro detectados (ex.: "preco_cedo_demais"). */
  mistakes: string[];
  /** Transcrição condensada das últimas mensagens (CLIENTE:/VENDEDOR:). */
  transcript: string;
}

export interface CoachingInput {
  sellerName: string;
  companyName: string;
  periodLabel: string; // ex.: "últimos 7 dias"
  conversations: CoachingConversationInput[];
}

const COACHING_SYSTEM_PROMPT = `Você é um COORDENADOR COMERCIAL experiente dando
feedback direto para um vendedor do seu time, com base nas conversas reais dele.

Seu feedback é PRÁTICO e ESPECÍFICO, no estilo de anotações de coordenador. Exemplos
do tom e do nível de especificidade esperados:
- "Aqui o cara falou a dor dele, disse que se sentia perdido, e mesmo assim não foi
  feito o upsell pra oferecer algo melhor que o básico. (telefone do lead)"
- "Faz follow up nesse aqui, tá perto de comprar (telefone)"
- "Tá usando texto muito grande e com cara de IA."
- "Está jogando todas as informações e ofertas de uma vez, isso assusta o lead."
- "Coloca um prazo nas ofertas pra o cliente não achar que é pra sempre."
- "Melhorou muito o uso de áudios, está objetivo e direto, quebrando bem objeções,
  está de parabéns."

Regras:
- SEMPRE que recomendar follow up ou apontar um problema numa conversa específica,
  CITE o lead (o telefone/identificação fornecido). Feedback genérico não serve.
- Elogie o que está genuinamente bom (com exemplo), não invente elogio.
- Seja direto e humano, como um coordenador falando, não um relatório corporativo.
- Foque no que dá pra MELHORAR e COMO. Nada de encher linguiça.
- Se não houver conversa suficiente para avaliar, diga isso em uma linha.

Formato (markdown simples, sem tabelas):
**O que está indo bem**
- ...

**O que precisa melhorar**
- ... (cite os leads)

**Follow ups pra fazer agora**
- (telefone) motivo curto

Estilo: PROIBIDO usar travessão. Nunca escreva "—" nem "–". Português do Brasil.`;

const OUTCOME_LABEL: Record<CoachingConversationInput["outcome"], string> = {
  EM_ABERTO: "em aberto",
  GANHA: "ganha",
  PERDIDA: "perdida",
};

function formatConversations(convs: CoachingConversationInput[]): string {
  return convs
    .map((c, i) => {
      const prob = c.lastProbability != null ? `${c.lastProbability}%` : "sem estimativa";
      const mistakes = c.mistakes.length > 0 ? c.mistakes.join(", ") : "nenhum sinalizado";
      return `### Conversa ${i + 1} — lead ${c.leadLabel}
Desfecho: ${OUTCOME_LABEL[c.outcome]} | Probabilidade: ${prob} | Erros sinalizados: ${mistakes}
Transcrição:
${c.transcript || "(sem mensagens de texto)"}`;
    })
    .join("\n\n");
}

/** Gera o texto do relatório de coaching de um vendedor. */
export async function generateSellerCoaching(input: CoachingInput): Promise<string> {
  if (input.conversations.length === 0) {
    return `**${input.sellerName}** não teve conversas com atividade suficiente ${input.periodLabel} para uma avaliação. Assim que atender novos leads, o coaching aparece aqui.`;
  }

  const prompt = `Vendedor: ${input.sellerName}
Empresa: ${input.companyName}
Período: ${input.periodLabel}
Total de conversas analisadas: ${input.conversations.length}

CONVERSAS DO VENDEDOR
${formatConversations(input.conversations)}

Escreva o feedback de coaching para ${input.sellerName}.`;

  const { text } = await generateText({
    model: anthropic(AI_CONFIG.generationModel),
    system: COACHING_SYSTEM_PROMPT,
    prompt,
    abortSignal: llmAbortSignal(),
  }).catch(rethrowLlmError);

  return stripDashes(text.trim());
}
