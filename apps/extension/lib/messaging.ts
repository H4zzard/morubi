// Tipos das mensagens trocadas entre content script <-> side panel (chrome.runtime).
// Blobs não sobrevivem à serialização JSON do runtime, então áudio vai em base64.
import type { Channel } from "@morubi/api-client";
import type { ActiveChat } from "@/entrypoints/content/adapters/types";

export interface WireMessage {
  externalId: string;
  sender: "cliente" | "vendedor";
  type: "texto" | "audio";
  text: string;
  audioBase64?: string;
  audioMime?: string;
  timestamp: string;
}

export interface ConversationUpdate {
  type: "MORUBI_CONVERSATION_UPDATE";
  channel: Channel;
  chat: ActiveChat | null;
  messages: WireMessage[];
}

// Side panel -> content: pedido de snapshot imediato.
export interface RequestSnapshot {
  type: "MORUBI_REQUEST_SNAPSHOT";
}

export type RuntimeMessage = ConversationUpdate | RequestSnapshot;
