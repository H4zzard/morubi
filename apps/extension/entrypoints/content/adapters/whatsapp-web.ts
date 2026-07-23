// ============================================================================
// Adaptador WhatsApp Web — ÚNICO lugar que conhece o DOM do WhatsApp.
// Se o layout mudar e quebrar a leitura, este é o único arquivo a ajustar.
//
// Seletores confirmados por inspeção ao vivo do DOM atual do WhatsApp Web
// (não são mais baseados nas classes antigas .message-in/.message-out, que
// não existem na versão atual):
//   - Container das mensagens: [data-testid="conversation-panel-messages"]
//   - Cada linha: [role="row"]; a mensagem em si: [data-testid^="conv-msg-"]
//     com atributo data-id ÚNICO e ESTÁVEL (usado como externalId/dedupe).
//   - Texto: [data-testid="selectable-text"]
//   - Direção: [data-testid="tail-in"] = cliente, [data-testid="tail-out"] =
//     vendedor — só aparece na 1ª mensagem de um grupo consecutivo do mesmo
//     remetente; as seguintes herdam a direção da anterior.
//   - Timestamp real: atributo data-pre-plain-text, formato
//     "[HH:MM, DD/MM/AAAA] +55 ..: " (locale PT-BR, dia antes do mês).
//   - Nome do contato: [data-testid="conversation-info-header-chat-title"]
// ============================================================================
import type { ActiveChat, ChannelAdapter, ObservedMessage } from "./types";

const SEL = {
  chatTitle: '[data-testid="conversation-info-header-chat-title"]',
  messagesContainer: '[data-testid="conversation-panel-messages"]',
  panelWrapper: '[data-testid="conversation-panel-wrapper"]',
  row: '[role="row"]',
  msg: '[data-testid^="conv-msg-"]',
  text: '[data-testid="selectable-text"]',
  tailIn: '[data-testid="tail-in"]',
  tailOut: '[data-testid="tail-out"]',
  prePlainText: ".copyable-text[data-pre-plain-text]",
} as const;

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

/** Converte "[10:38, 10/07/2026] +55 81 95168-6736: " -> ISO. Locale PT-BR (DD/MM/AAAA). */
function parsePreTimestamp(pre: string | null): string | null {
  if (!pre) return null;
  const m = pre.match(/^\[(\d{1,2}):(\d{2}), (\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
  if (!m) return null;
  const [, hh, mm, dd, MM, yyyy] = m;
  const date = new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const whatsappWebAdapter: ChannelAdapter = {
  id: "whatsapp_web",
  hostPatterns: ["https://web.whatsapp.com/*"],

  matches(url: string): boolean {
    return url.includes("web.whatsapp.com");
  },

  getActiveChat(): ActiveChat | null {
    const title = textOf(document.querySelector(SEL.chatTitle));
    if (!title) return null;
    return { externalKey: title, leadName: title };
  },

  getMessages(): ObservedMessage[] {
    const container = document.querySelector(SEL.messagesContainer);
    if (!container) return [];

    const messages: ObservedMessage[] = [];
    // Direção só vem marcada (tail-in/tail-out) na 1ª msg de um grupo
    // consecutivo do mesmo remetente; as seguintes herdam a anterior.
    let lastSender: ObservedMessage["sender"] = "cliente";

    container.querySelectorAll(SEL.row).forEach((row) => {
      const msgEl = row.querySelector(SEL.msg);
      if (!msgEl) return; // linha de sistema (ex.: aviso de criptografia), separador de data etc.

      const externalId = msgEl.getAttribute("data-id") ?? msgEl.getAttribute("data-testid");
      if (!externalId) return; // sem id estável não dá pra dedupar -> ignora

      const hasTailIn = !!row.querySelector(SEL.tailIn);
      const hasTailOut = !!row.querySelector(SEL.tailOut);
      const sender: ObservedMessage["sender"] = hasTailIn
        ? "cliente"
        : hasTailOut
          ? "vendedor"
          : lastSender;
      lastSender = sender;

      const text = textOf(row.querySelector(SEL.text));

      const audioEl = row.querySelector("audio");
      const hasAudioTestid = !!row.querySelector('[data-testid*="audio" i], [data-testid*="ptt" i]');
      const isAudio = !!audioEl || hasAudioTestid;

      if (!text && !isAudio) return;

      const pre = row.querySelector(SEL.prePlainText)?.getAttribute("data-pre-plain-text") ?? null;
      const timestamp = parsePreTimestamp(pre) ?? new Date().toISOString();

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
    const container =
      document.querySelector(SEL.messagesContainer) ??
      document.querySelector(SEL.panelWrapper) ??
      document.body;

    let scheduled: number | null = null;
    const debounced = () => {
      if (scheduled) window.clearTimeout(scheduled);
      scheduled = window.setTimeout(callback, 600);
    };

    const observer = new MutationObserver(debounced);
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  },

  /**
   * Tenta capturar o Blob de um áudio de voz do WhatsApp a partir do elemento
   * <audio> (src costuma ser um blob: URL). Best-effort: pode falhar se a
   * mídia ainda não foi carregada. Localiza a linha pelo mesmo data-id usado
   * como externalId em getMessages().
   */
  async captureAudioBlob(externalId: string): Promise<Blob | null> {
    const container = document.querySelector(SEL.messagesContainer);
    if (!container) return null;

    const msgEl = container.querySelector(
      `[data-testid^="conv-msg-"][data-id="${CSS.escape(externalId)}"]`,
    );
    const row = msgEl?.closest(SEL.row) ?? msgEl;
    const audioEl = row?.querySelector("audio") as HTMLAudioElement | null;
    if (!audioEl?.src) return null;

    try {
      const res = await fetch(audioEl.src);
      return await res.blob();
    } catch {
      return null;
    }
  },
};
