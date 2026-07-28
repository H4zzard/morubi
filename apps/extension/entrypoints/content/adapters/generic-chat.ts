// ============================================================================
// Adaptador de chat GENÉRICO — lê qualquer CRM baseado em conversa sem seletor
// codificado à mão. É o FALLBACK: só entra quando nenhum adaptador específico
// (WhatsApp, Kentro...) reconhece a URL.
//
// Ideia central: em vez de saber "a classe do balão é .message-in", INFERIMOS a
// estrutura a partir de sinais universais de qualquer UI de chat:
//   - a lista de mensagens é o elemento rolável com muitos filhos parecidos;
//   - o remetente se distingue pelo LADO (esquerda = cliente, direita = vendedor)
//     e/ou pela COR de fundo do balão;
//   - o texto é o conteúdo visível menos o "cromo" (hora, player, contadores).
//
// Nada disso é 100%. Por isso o adaptador também calcula uma CONFIANÇA: quando
// ela é baixa, o painel avisa em vez de alimentar a IA com leitura duvidosa.
// ============================================================================
import type { ActiveChat, ChannelAdapter, ObservedMessage } from "./types";
import {
  audioSourceUrl,
  cleanBubbleText,
  hashId,
  looksLikeAudio,
  parseTimeLoose,
  textOf,
} from "./dom-utils";

/**
 * Domínios em que o genérico pode rodar. É uma ALLOWLIST de propósito: não
 * injetamos em qualquer site (privacidade + reprovação na Web Store). Cada CRM
 * novo de cliente entra aqui no onboarding. Padrões no formato do manifest.
 */
// Z-Pro (família Whaticket) é auto-hospedado: cada empresa usa o PRÓPRIO domínio,
// não um domínio compartilhado da plataforma. Então cada cliente novo entra aqui
// com o domínio dele. Mantenha em sincronia com host_permissions em wxt.config.ts.
export const GENERIC_CRM_HOSTS: string[] = [
  "https://atendimento.cppem.com.br/*", // CPPEM (Z-Pro)
];

function hostRegexes(): RegExp[] {
  return GENERIC_CRM_HOSTS.map((p) => {
    const host = p.replace(/^https?:\/\//, "").replace(/\/\*$/, "");
    const re = host.replace(/\./g, "\\.").replace(/\*/g, "[^/]*");
    return new RegExp(`^${re}$`, "i");
  });
}

// --- Descoberta da lista de mensagens --------------------------------------

let cachedContainer: Element | null = null;

function isScrollable(el: Element): boolean {
  const style = getComputedStyle(el);
  const oy = style.overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 40;
}

/**
 * Um "balão" candidato: bloco com texto curto/médio visível, que não é a página
 * inteira. Usamos isto para achar o container (quem tem MAIS balões parecidos).
 */
function looksLikeBubble(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 16 || r.width > window.innerWidth * 0.95) return false;
  const t = textOf(el);
  if ((t.length < 1 || t.length > 1500) && !looksLikeAudio(el)) return false;
  return true;
}

/**
 * Acha o elemento que contém a conversa: o rolável com o maior número de filhos
 * diretos parecidos entre si (as mensagens). Cacheado; refeito só quando o
 * container sai da tela ou fica vazio.
 */
function findContainer(): Element | null {
  if (cachedContainer?.isConnected && cachedContainer.childElementCount >= 2) {
    return cachedContainer;
  }

  let best: { el: Element; score: number } | null = null;

  for (const el of document.querySelectorAll("div, ul, section, main")) {
    const children = Array.from(el.children);
    if (children.length < 3) continue;

    const bubbleChildren = children.filter((c) => looksLikeBubble(c));
    if (bubbleChildren.length < 3) continue;

    // Pontua: nº de balões, bônus se for rolável, penaliza containers gigantes
    // que englobam a página toda.
    let score = bubbleChildren.length;
    if (isScrollable(el)) score += 20;
    const r = el.getBoundingClientRect();
    if (r.height > window.innerHeight * 1.5) score -= 10;

    if (!best || score > best.score) best = { el, score };
  }

  cachedContainer = best?.el ?? null;
  return cachedContainer;
}

// --- Remetente: alinhamento + cor ------------------------------------------

/** Cor de fundo "efetiva" (sobe até achar um fundo não transparente). */
function bgColor(el: Element): string {
  let node: Element | null = el;
  for (let i = 0; i < 4 && node; i++) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    node = node.parentElement;
  }
  return "";
}

interface RawBubble {
  el: Element;
  centerX: number;
  bg: string;
  text: string;
  isAudio: boolean;
  timestamp: string;
}

/**
 * Decide o remetente de cada balão. Sinal primário: posição horizontal do
 * centro do balão dentro do container (direita = vendedor). Como reforço, se os
 * balões formam dois grupos de cor bem definidos, a cor mais à direita também é
 * "vendedor". Retorna também uma CONFIANÇA da separação.
 */
function classifySenders(bubbles: RawBubble[], containerCenterX: number): {
  senders: ("cliente" | "vendedor")[];
  confidence: number;
} {
  const senders = bubbles.map((b) =>
    b.centerX >= containerCenterX ? ("vendedor" as const) : ("cliente" as const),
  );

  // Confiança pela nitidez da separação de lados: quanto mais os balões se
  // afastam do centro (para os lados), mais claro é o layout de chat.
  const spread =
    bubbles.reduce((acc, b) => {
      const half = window.innerWidth / 2 || 1;
      return acc + Math.min(1, Math.abs(b.centerX - containerCenterX) / (half * 0.5));
    }, 0) / (bubbles.length || 1);

  // Se ficou tudo do mesmo lado, a leitura por alinhamento é fraca -> tenta cor.
  const distinctSides = new Set(senders).size;
  if (distinctSides < 2) {
    const colors = new Set(bubbles.map((b) => b.bg).filter(Boolean));
    if (colors.size >= 2) {
      // Duas cores predominantes: a do balão mais à direita = vendedor.
      const rightMost = bubbles.reduce((a, b) => (b.centerX > a.centerX ? b : a), bubbles[0]!);
      const outColor = rightMost.bg;
      return {
        senders: bubbles.map((b) => (b.bg === outColor ? "vendedor" : "cliente")),
        confidence: 0.5,
      };
    }
    return { senders, confidence: 0.2 }; // sem como separar com segurança
  }

  return { senders, confidence: Math.min(0.95, 0.5 + spread * 0.5) };
}

// --- Identidade da conversa ------------------------------------------------

const AGENT_NOISE = /online|offline|digitando|visto|typing/i;

/** Melhor tentativa de nome/telefone do contato, na faixa do cabeçalho. */
function contactName(container: Element | null): string | null {
  const top = container?.getBoundingClientRect().top ?? 120;
  let best: { text: string; score: number } | null = null;

  for (const el of document.querySelectorAll("h1, h2, h3, span, div, strong, b")) {
    if (el.children.length > 0) continue;
    const t = textOf(el);
    if (t.length < 3 || t.length > 48) continue;
    if (AGENT_NOISE.test(t)) continue;
    const r = el.getBoundingClientRect();
    // Acima da lista de mensagens (cabeçalho) e não coladinho na borda esquerda
    // (onde costuma ficar a lista de conversas).
    if (r.top < 0 || r.top >= top || r.left < 200) continue;

    // Telefone tem prioridade; nomes maiores/mais à esquerda no header também.
    const isPhone = /\+?\d[\d\s().-]{8,}/.test(t);
    const score = (isPhone ? 100 : 0) + (r.width || 0) - r.left * 0.05;
    if (!best || score > best.score) best = { text: t, score };
  }
  return best?.text ?? null;
}

// --- Adaptador -------------------------------------------------------------

const rowByExternalId = new Map<string, Element>();
let lastConfidence = 0;

function readBubbles(): RawBubble[] {
  const container = findContainer();
  if (!container) return [];
  const containerRect = container.getBoundingClientRect();

  const out: RawBubble[] = [];
  for (const el of Array.from(container.children)) {
    if (!looksLikeBubble(el)) continue;
    const r = el.getBoundingClientRect();
    const isAudio = looksLikeAudio(el);
    const text = cleanBubbleText(el);
    if (!text && !isAudio) continue;

    out.push({
      el,
      centerX: r.left + r.width / 2,
      bg: bgColor(el),
      text,
      isAudio,
      timestamp: parseTimeLoose(textOf(el)) ?? new Date().toISOString(),
    });
  }
  return out;
}

export const genericChatAdapter: ChannelAdapter = {
  id: "generic",
  hostPatterns: GENERIC_CRM_HOSTS,

  matches(url: string): boolean {
    return hostRegexes().some((re) => re.test(new URL(url).host));
  },

  getActiveChat(): ActiveChat | null {
    const bubbles = readBubbles();
    if (bubbles.length === 0) return null;

    const container = findContainer();
    const name = contactName(container);
    if (name) {
      const digits = name.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) {
        return { externalKey: digits, leadName: name };
      }
      return { externalKey: name, leadName: name };
    }

    // Sem nome confiável: a conversa é identificada pela impressão digital das
    // primeiras mensagens (muda quando o vendedor troca de conversa).
    const fp = hashId(bubbles.slice(0, 3).map((b) => b.text).join("|").slice(0, 240));
    return { externalKey: `generic-${fp}`, leadName: null };
  },

  getMessages(): ObservedMessage[] {
    rowByExternalId.clear();
    const bubbles = readBubbles();
    if (bubbles.length === 0) {
      lastConfidence = 0;
      return [];
    }

    const container = findContainer()!;
    const cRect = container.getBoundingClientRect();
    const { senders, confidence } = classifySenders(bubbles, cRect.left + cRect.width / 2);
    lastConfidence = confidence;

    return bubbles.map((b, i) => {
      const sender = senders[i]!;
      const externalId = b.el.id || `g-${hashId(`${sender}|${b.timestamp}|${b.text}`)}`;
      rowByExternalId.set(externalId, b.el);
      return {
        externalId,
        sender,
        type: b.isAudio ? "audio" : "texto",
        text: b.text,
        timestamp: b.timestamp,
      };
    });
  },

  /** Confiança 0..1 da última leitura (usada pelo content script/painel). */
  confidence(): number {
    return lastConfidence;
  },

  onChange(callback: () => void): () => void {
    let scheduled: number | null = null;
    const debounced = () => {
      if (scheduled) window.clearTimeout(scheduled);
      scheduled = window.setTimeout(callback, 600);
    };
    const observer = new MutationObserver(debounced);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  },

  async captureAudioBlob(externalId: string): Promise<Blob | null> {
    const row = rowByExternalId.get(externalId);
    if (!row) return null;
    const url = audioSourceUrl(row);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  },
};
