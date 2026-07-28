// Interface ÚNICA de adaptador de canal. Adicionar um canal no futuro é criar
// um novo arquivo que implementa isto — o side panel e o backend não sabem de
// onde a mensagem veio.
import type { Channel } from "@morubi/api-client";

export interface ObservedMessage {
  /** Identificador estável da mensagem no canal (para dedupe). */
  externalId: string;
  sender: "cliente" | "vendedor";
  type: "texto" | "audio";
  /** Texto da mensagem (vazio se áudio ainda não transcrito). */
  text: string;
  /** Presente quando type === "audio" e foi possível capturar o blob. */
  audioBlob?: Blob;
  /** ISO timestamp da mensagem (aproximado quando o canal não expõe). */
  timestamp: string;
}

export interface ActiveChat {
  /** Chave estável do chat ativo (ex.: nome/telefone do contato). */
  externalKey: string;
  leadName: string | null;
}

export interface ChannelAdapter {
  /** Precisa bater com um dos valores de ChannelSchema em @morubi/api-client. */
  id: Channel;
  /** Padrões de URL (formato de manifest, ex.: "https://*.exemplo.com/*") em
   * que este adaptador deve ser injetado. Usado para montar `matches` do
   * content script automaticamente — não precisa editar wxt.config.ts nem
   * content/index.ts ao adicionar um canal novo. */
  hostPatterns: string[];
  /** Este adaptador serve para a URL atual? */
  matches(url: string): boolean;
  /** Chat atualmente aberto, ou null se nenhum. */
  getActiveChat(): ActiveChat | null;
  /** Snapshot das mensagens visíveis do chat ativo. */
  getMessages(): ObservedMessage[];
  /** Assina mudanças; retorna função de cancelamento. */
  onChange(callback: () => void): () => void;
  /**
   * Best-effort: captura o Blob de um áudio já renderizado na tela, pelo
   * mesmo externalId retornado em getMessages(). Opcional — nem todo canal
   * precisa implementar (ex.: se não há mensagem de voz no canal).
   */
  captureAudioBlob?(externalId: string): Promise<Blob | null>;
  /**
   * Confiança da última leitura (0..1). Adaptadores específicos (seletores
   * afinados à mão) leem com certeza e não precisam implementar — nesse caso
   * a leitura é tratada como alta confiança. O adaptador genérico, que INFERE
   * a estrutura, informa aqui o quão seguro está, para o painel avisar em vez
   * de alimentar a IA com uma leitura duvidosa.
   */
  confidence?(): number;
}
