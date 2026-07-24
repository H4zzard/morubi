// ============================================================================
// Adaptador Kentro/AtenderBem — ÚNICO lugar que conhece o DOM do Kentro.
// Se o layout mudar e quebrar a leitura, este é o único arquivo a ajustar.
//
// Kentro é uma app Angular Material (não usa data-testid nem data-id — só
// classes utilitárias e hashes `ng-tns-*` instáveis entre builds). Seletores
// confirmados por inspeção ao vivo do DOM real em /base/agentchat:
//   - Mensagem do cliente: div.message-in
//   - Mensagem do vendedor/agente: div.message-out
//   - O `id` de CADA mensagem é o próprio wamid do WhatsApp
//     (ex.: "wamid.HBgM...") — a Kentro integra via API oficial do WhatsApp.
//     Isso vira o externalId (dedupe) E, decodificado em base64, contém o
//     TELEFONE do contato em ASCII puro — usamos isso como externalKey da
//     conversa, já que muitos contatos não têm nome cadastrado (aparecem só
//     como "@...").
//   - Mensagens do vendedor trazem um prefixo "<b>Nome do agente:</b>" como
//     primeiro filho do bloco de texto — removido na extração.
//   - Timestamp: .message-time-label, formato "DD/MM/AAAA · HH:MM:SS".
//   - Áudio: mensagens de voz têm uma tag <audio> dentro da bolha.
//
// Não há um container/rota estável por conversa (a URL não muda ao trocar de
// chat), então getActiveChat() deriva a identidade da conversa a partir da
// PRIMEIRA mensagem visível na tela — funciona porque só uma conversa fica
// aberta por vez.
// ============================================================================
import type { ActiveChat, ChannelAdapter, ObservedMessage } from "./types";

const SEL = {
  message: ".message-in, .message-out",
  timeLabel: ".message-time-label",
  actionsMenu: ".message-actions-menu",
  /// Componente do player de áudio do Kentro (envolve o <audio> e a UI toda).
  audioPlayer: "app-custom-audio",
} as const;

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

/** Hash estável (djb2) para identificar mensagem sem id próprio. */
function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Identificador estável da mensagem, para dedupe.
 *
 * Nem toda mensagem do Kentro tem `id="wamid...."`: isso aparece nas que vêm
 * pela API oficial do WhatsApp, mas conversas de outros canais (Meta Ads,
 * Instagram) chegam sem id nenhum. Exigir o wamid fazia TODAS as mensagens
 * dessas conversas serem descartadas, então caímos para um hash do conteúdo.
 */
function messageExternalId(row: Element, sender: string, text: string, timestamp: string): string {
  if (row.id) return row.id;
  return `k-${hashId(`${sender}|${timestamp}|${text}`)}`;
}

/**
 * externalId -> elemento da bolha, preenchido em getMessages(). Necessário
 * porque o id gerado por hash não existe no DOM, então captureAudioBlob() não
 * conseguiria reencontrar a mensagem por seletor.
 */
const rowByExternalId = new Map<string, Element>();

/** Linhas de rótulo do bloco do contato (ficam LOGO ABAIXO do nome). */
const CONTACT_META = /protocolo|etiquetas?/i;

/**
 * Elemento-âncora do bloco do contato. Guardamos só a âncora, nunca o nome:
 * o nome é relido do DOM a cada chamada, senão a troca de conversa passaria
 * despercebida (foi exatamente o bug de ficar preso no contato anterior).
 */
let cachedAnchor: Element | null = null;

/** Sobe a partir da âncora e devolve a primeira linha que não é rótulo: o nome. */
function nameFromAnchor(anchor: Element): string | null {
  let node: Element | null = anchor.parentElement;
  for (let hop = 0; hop < 4 && node; hop++) {
    for (const leaf of node.querySelectorAll("*")) {
      if (leaf.children.length > 0) continue;
      const t = textOf(leaf);
      if (t.length < 2 || t.length > 60) continue;
      if (CONTACT_META.test(t)) continue;
      return t;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Nome (ou telefone) do CONTATO, lido do cabeçalho da conversa.
 *
 * Cuidado que custou um bug: o topo da página também mostra o nome do AGENTE
 * logado, à direita. Uma busca por "texto no topo da tela" pega o agente e não
 * o contato. Por isso ancoramos nas linhas "Contato sem etiquetas"/"Sem
 * protocolo", que só existem no bloco do contato, e subimos até o nome.
 */
function headerIdentity(): string | null {
  if (cachedAnchor?.isConnected) {
    const name = nameFromAnchor(cachedAnchor);
    if (name) return name;
  }

  for (const el of document.querySelectorAll("span, div, small, p")) {
    if (el.children.length > 0) continue;
    const t = textOf(el);
    if (!CONTACT_META.test(t) || t.length > 40) continue;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > 220 || r.width === 0) continue; // faixa do cabeçalho

    const name = nameFromAnchor(el);
    if (name) {
      cachedAnchor = el;
      return name;
    }
  }
  return null;
}

/** Mensagem de voz? O Kentro renderiza o player mesmo antes do play. */
function isAudioMessage(row: Element): boolean {
  return !!row.querySelector(`audio, ${SEL.audioPlayer}`);
}

/**
 * URL do arquivo de áudio.
 *
 * ATENÇÃO: o Kentro NÃO coloca o src no <audio>, e sim num <source> filho:
 *   <audio preload="auto"><source src="https://.../downloadMedia?id=..&auth=.."></audio>
 * Ler `audioEl.src` retorna string vazia, que era a causa de o áudio nunca ser
 * capturado (e a IA agir como se a conversa não tivesse a fala do vendedor).
 */
function audioSourceUrl(row: Element): string | null {
  const audioEl = row.querySelector("audio");
  if (!audioEl) return null;
  const direct = audioEl.getAttribute("src");
  if (direct) return direct;
  return audioEl.querySelector("source")?.getAttribute("src") ?? null;
}

/** Decodifica o wamid (base64) e extrai o telefone embutido em ASCII. */
function phoneFromWamid(id: string): string | null {
  const prefix = "wamid.";
  if (!id.startsWith(prefix)) return null;
  try {
    const decoded = atob(id.slice(prefix.length));
    const match = decoded.match(/\d{10,15}/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/** Formata "5587996612518" -> "+55 87 99661-2518" (heurístico; cai pro bruto se não bater o padrão). */
function formatPhone(digits: string): string {
  const m = digits.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return `+${digits}`;
  const [, ddi, ddd, part1, part2] = m;
  return `+${ddi} ${ddd} ${part1}-${part2}`;
}

/** "17/07/2026 · 15:13:13" -> ISO. */
function parseTimeLabel(text: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*·\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, MM, yyyy, hh, mm, ss] = m;
  const date = new Date(
    Number(yyyy),
    Number(MM) - 1,
    Number(dd),
    Number(hh),
    Number(mm),
    Number(ss),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Detecta o prefixo "<b>Nome do atendente:</b>" que o Kentro coloca no início
 * das mensagens de ATENDENTE. É o sinal confiável de que a mensagem é de um
 * vendedor — a classe visual (.message-in/.message-out) engana em fila
 * compartilhada, onde a mensagem de outro atendente renderiza do lado do
 * cliente. Retorna o texto do prefixo (com ":") ou null.
 *
 * Cuidado com falso positivo: cliente pode mandar negrito (ex.: *aviso*). Por
 * isso exigimos que o negrito TERMINE com ":" e seja o começo do texto.
 */
function detectAgentPrefix(container: Element, fullText: string): string | null {
  const bold = container.querySelector("b");
  if (!bold) return null;
  const boldText = textOf(bold);
  if (!boldText.endsWith(":")) return null;
  if (!fullText.startsWith(boldText)) return null;
  // Nome de atendente é curto; evita capturar uma frase inteira em negrito.
  if (boldText.length > 40) return null;
  return boldText;
}

/** Extrai o texto da bolha (sem timestamp/menu/player) e diz se é de atendente. */
function extractMessage(container: Element): { text: string; isAgent: boolean } {
  const clone = container.cloneNode(true) as Element;

  // Remove tudo que é cromo da interface, não conteúdo da mensagem.
  // O player de áudio é crítico aqui: sem removê-lo, a "mensagem" viraria
  // "1x 00:00 / 00:04", que além de ser lixo para a IA, fazia o áudio parecer
  // uma mensagem de texto (e por isso nunca era transcrito).
  clone
    .querySelectorAll(`${SEL.timeLabel}, ${SEL.actionsMenu}, ${SEL.audioPlayer}, audio`)
    .forEach((el) => el.remove());

  let text = textOf(clone);

  const prefix = detectAgentPrefix(container, text);
  if (prefix) text = text.slice(prefix.length).trim();

  return { text, isAgent: prefix !== null };
}

export const kentroAdapter: ChannelAdapter = {
  id: "kentro",
  hostPatterns: ["https://*.atenderbem.com/*"],

  matches(url: string): boolean {
    return url.includes("atenderbem.com");
  },

  /**
   * Identidade da conversa aberta, em camadas — porque nem todo canal do
   * Kentro tem as mesmas pistas:
   *   1. wamid  -> telefone (WhatsApp oficial; melhor caso)
   *   2. cabeçalho -> telefone ou nome do contato (Meta Ads, Instagram etc.)
   *   3. hash da mensagem mais antiga visível (último recurso)
   * A camada 3 existe para o painel NUNCA ficar preso em "abra uma conversa"
   * quando as mensagens estão claramente na tela.
   */
  getActiveChat(): ActiveChat | null {
    const rows = document.querySelectorAll(SEL.message);
    if (rows.length === 0) return null; // nenhuma conversa aberta de fato

    // 1. wamid (traz o telefone real embutido)
    const wamidEl = document.querySelector('[id^="wamid."]');
    if (wamidEl) {
      const phone = phoneFromWamid(wamidEl.id);
      if (phone) return { externalKey: phone, leadName: formatPhone(phone) };
    }

    // 2. cabeçalho da conversa
    const header = headerIdentity();
    if (header) {
      const digits = header.replace(/\D/g, "");
      // Se o cabeçalho é um telefone, normaliza para casar com a chave do wamid.
      if (digits.length >= 10 && digits.length <= 15) {
        return { externalKey: digits, leadName: formatPhone(digits) };
      }
      return { externalKey: header, leadName: header };
    }

    // 3. último recurso: a mensagem mais antiga visível é o que menos muda.
    const oldest = rows[0]!;
    const fingerprint = hashId(textOf(oldest).slice(0, 200));
    return { externalKey: `kentro-${fingerprint}`, leadName: null };
  },

  getMessages(): ObservedMessage[] {
    const messages: ObservedMessage[] = [];
    rowByExternalId.clear();

    document.querySelectorAll(SEL.message).forEach((row) => {
      const timestamp = parseTimeLabel(textOf(row.querySelector(SEL.timeLabel))) ?? new Date().toISOString();

      const isAudio = isAudioMessage(row);
      const { text, isAgent } = extractMessage(row);

      // Prefixo de atendente é o sinal primário; a classe CSS é só fallback
      // (ex.: áudio do vendedor sem texto, portanto sem prefixo).
      const isOut = isAgent || row.classList.contains("message-out");
      const sender: ObservedMessage["sender"] = isOut ? "vendedor" : "cliente";

      if (!text && !isAudio) return;

      const externalId = messageExternalId(row, sender, text, timestamp);
      rowByExternalId.set(externalId, row);

      messages.push({
        externalId,
        sender,
        type: isAudio ? "audio" : "texto",
        text,
        timestamp,
      });
    });

    return messages;
  },

  onChange(callback: () => void): () => void {
    // Sem container/rota estável identificado para a lista de mensagens;
    // observar o body inteiro é o fallback seguro (mesmo usado no adaptador
    // do WhatsApp Web quando nenhum container mais específico é encontrado).
    let scheduled: number | null = null;
    const debounced = () => {
      if (scheduled) window.clearTimeout(scheduled);
      scheduled = window.setTimeout(callback, 600);
    };

    const observer = new MutationObserver(debounced);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  },

  /**
   * Baixa o arquivo da mensagem de voz. A URL vem do <source> dentro do <audio>
   * (ver audioSourceUrl) e aponta para o próprio domínio do Kentro, com token
   * `auth` na query. Como o content script roda na origem da página, o fetch
   * herda a sessão e o download funciona.
   */
  async captureAudioBlob(externalId: string): Promise<Blob | null> {
    // O índice cobre os ids gerados por hash (que não existem no DOM). O
    // seletor é o fallback; nele, cuidado: o Kentro repete o mesmo id no
    // container de mídia interno, por isso filtramos pela bolha.
    const row =
      rowByExternalId.get(externalId) ??
      document.querySelector(`${SEL.message}[id="${CSS.escape(externalId)}"]`);
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
