// Content script: observa o canal ativo (via adaptador) e envia atualizações
// ao side panel. Não conhece auth nem a API — só o DOM (via adaptador) e o runtime.
import { resolveAdapter, MATCHED_HOST_PATTERNS } from "./adapters/registry";
import type { ConversationUpdate, RuntimeMessage, WireMessage } from "@/lib/messaging";

/**
 * O background reinjeta este script nas abas já abertas (ver background.ts).
 * Numa aba que já o tinha, isso rodaria o main() duas vezes e criaria dois
 * MutationObserver enviando updates em dobro. A flag vive no mundo isolado do
 * content script, que é compartilhado entre injeções na mesma aba.
 */
declare global {
  interface Window {
    __morubiContentLoaded?: boolean;
  }
}

export default defineContentScript({
  matches: MATCHED_HOST_PATTERNS,
  async main() {
    if (window.__morubiContentLoaded) return;
    window.__morubiContentLoaded = true;

    const adapter = resolveAdapter(location.href);
    if (!adapter) return;

    const sentAudio = new Set<string>();

    async function toWire(): Promise<WireMessage[]> {
      const observed = adapter!.getMessages();
      const wire: WireMessage[] = [];
      for (const m of observed) {
        const w: WireMessage = {
          externalId: m.externalId,
          sender: m.sender,
          type: m.type,
          text: m.text,
          timestamp: m.timestamp,
        };
        // Captura o áudio uma única vez por mensagem (best-effort).
        if (m.type === "audio" && !m.text && !sentAudio.has(m.externalId)) {
          const blob = await adapter!.captureAudioBlob?.(m.externalId);
          if (blob) {
            w.audioBase64 = await blobToBase64(blob);
            w.audioMime = blob.type || "audio/ogg";
            sentAudio.add(m.externalId);
          }
        }
        wire.push(w);
      }
      return wire;
    }

    async function pushUpdate() {
      const messages = await toWire();
      const update: ConversationUpdate = {
        type: "MORUBI_CONVERSATION_UPDATE",
        channel: adapter!.id,
        chat: adapter!.getActiveChat(),
        messages,
        // Adaptador específico (sem confidence) = leitura confiável por design.
        confidence: adapter!.confidence ? adapter!.confidence() : 1,
      };
      chrome.runtime.sendMessage(update).catch(() => {
        /* side panel pode estar fechado */
      });
    }

    // Atualiza quando o DOM muda.
    adapter.onChange(() => void pushUpdate());

    // Responde a pedidos de snapshot do side panel.
    chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
      if (msg.type === "MORUBI_REQUEST_SNAPSHOT") void pushUpdate();
    });

    // Primeiro envio.
    void pushUpdate();
  },
});

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
