import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyzeResponse, MessageInput, Outcome } from "@morubi/api-client";
import { api } from "@/lib/api";
import type { ConversationUpdate, RuntimeMessage, WireMessage } from "@/lib/messaging";
import type { ActiveChat } from "@/entrypoints/content/adapters/types";

export type CopilotStatus =
  | "idle"
  | "no-chat"
  | "syncing"
  | "analyzing"
  | "ready"
  | "error"
  | "uncertain";

/** Abaixo disso, a leitura da conversa é duvidosa e não alimentamos a IA sozinhos. */
const MIN_CONFIDENCE = 0.35;

interface CopilotState {
  status: CopilotStatus;
  chat: ActiveChat | null;
  conversationId: string | null;
  outcome: Outcome | null;
  suggestion: AnalyzeResponse | null;
  /** Análises acumuladas deste contato. > 1 = o Morubi já conhece este lead. */
  memoryAnalysisCount: number;
  /** Última fala do cliente, exibida no topo da timeline. */
  lastClientMessage: string | null;
  error: string | null;
}

const b64ToBlob = (b64: string, mime: string): Blob => {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

export function useCopilot() {
  const [state, setState] = useState<CopilotState>({
    status: "idle",
    chat: null,
    conversationId: null,
    outcome: null,
    suggestion: null,
    memoryAnalysisCount: 0,
    lastClientMessage: null,
    error: null,
  });

  const patch = (p: Partial<CopilotState>) => setState((s) => ({ ...s, ...p }));

  // Estado mutável entre updates.
  const currentKey = useRef<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const inFlight = useRef(false);
  const pending = useRef<ConversationUpdate | null>(null);
  // Último update recebido + se o vendedor mandou "analisar mesmo assim".
  const lastUpdate = useRef<ConversationUpdate | null>(null);
  const forced = useRef(false);
  // Rastreado à parte de `state` (que fica "congelado" dentro do useCallback
  // com deps vazias) para saber, sem closure obsoleto, se já existe sugestão.
  const hasSuggestion = useRef(false);
  // Uma vez que a conversa atinge um estado final (ready ou error), updates
  // sem mensagem nova (ruído do DOM do WhatsApp: digitando, check azul etc.)
  // não devem mais sobrescrever o status — senão um erro real "some" de volta
  // pra "syncing" em menos de 1s, escondendo a causa do problema do usuário.
  const settled = useRef(false);

  const process = useCallback(async (update: ConversationUpdate) => {
    lastUpdate.current = update;
    if (inFlight.current) {
      pending.current = update; // coalescer o último
      return;
    }
    inFlight.current = true;
    try {
      // Leitura duvidosa (adaptador genérico inseguro): não alimentamos a IA
      // automaticamente — o vendedor pode forçar. Adaptador específico manda
      // confidence 1, então isto nunca dispara para WhatsApp/Kentro.
      if (update.chat && update.confidence < MIN_CONFIDENCE && !forced.current && !settled.current) {
        patch({ status: "uncertain", chat: update.chat });
        return;
      }

      if (!update.chat) {
        currentKey.current = null;
        conversationId.current = null;
        seen.current.clear();
        hasSuggestion.current = false;
        settled.current = false;
        patch({
          status: "no-chat",
          chat: null,
          conversationId: null,
          outcome: null,
          suggestion: null,
          memoryAnalysisCount: 0,
          lastClientMessage: null,
          error: null,
        });
        return;
      }

      // Trocou de conversa? (re)cria e reseta o rastreio. Chave composta por
      // canal+externalKey — a unicidade real no banco é (userId, channel, externalKey).
      const compositeKey = `${update.channel}:${update.chat.externalKey}`;
      if (compositeKey !== currentKey.current) {
        patch({ status: "syncing", chat: update.chat, suggestion: null, error: null });
        const conv = await api.upsertConversation({
          channel: update.channel,
          externalKey: update.chat.externalKey,
          leadName: update.chat.leadName,
        });
        currentKey.current = compositeKey;
        conversationId.current = conv.id;
        seen.current.clear();
        hasSuggestion.current = false;
        settled.current = false;
        forced.current = false; // nova conversa volta a exigir confiança
        // Se essa conversa já tinha um desfecho registrado antes (o vendedor
        // reabriu um chat já fechado), refletimos isso no painel em vez de
        // deixar parecer que nada foi marcado ainda.
        patch({
          conversationId: conv.id,
          chat: update.chat,
          outcome: conv.outcome === "EM_ABERTO" ? null : conv.outcome,
          memoryAnalysisCount: conv.memoryAnalysisCount,
        });
      }

      // Última fala do cliente visível na tela (topo da timeline do painel).
      const lastFromClient = [...update.messages].reverse().find((m) => m.sender === "cliente");
      if (lastFromClient?.text) patch({ lastClientMessage: lastFromClient.text });

      const convId = conversationId.current!;
      const fresh = update.messages.filter((m) => !seen.current.has(m.externalId));
      if (fresh.length === 0) {
        // Só ajusta o status se ainda não chegamos a um estado final; caso
        // contrário, deixa "ready"/"error" visíveis e estáveis.
        if (!settled.current) patch({ status: "syncing" });
        return;
      }

      patch({ status: "syncing" });

      // Resolve texto (transcreve áudio quando houver blob).
      const resolved: MessageInput[] = [];
      for (const m of fresh) {
        let text = m.text;
        if (m.type === "audio" && !text && m.audioBase64) {
          try {
            const blob = b64ToBlob(m.audioBase64, m.audioMime ?? "audio/ogg");
            const { text: t } = await api.transcribe(blob, "audio.ogg");
            text = t;
          } catch {
            text = "";
          }
        }
        // Áudio que não deu para transcrever NÃO pode ser descartado em silêncio:
        // sem isso a IA conclui que o assunto falado no áudio nunca foi tratado.
        // Mandamos um marcador para ela saber que houve uma mensagem de voz.
        if (m.type === "audio" && !text) {
          text = "[mensagem de voz que não foi possível transcrever]";
        }
        resolved.push({
          externalId: m.externalId,
          sender: m.sender,
          type: m.type,
          content: text,
          timestamp: m.timestamp,
        });
      }

      if (resolved.length === 0) return;

      await api.postMessages(convId, { messages: resolved });
      resolved.forEach((m) => m.externalId && seen.current.add(m.externalId));

      // Uma única chamada estruturada.
      patch({ status: "analyzing" });
      const suggestion = await api.analyze(convId, {});
      hasSuggestion.current = true;
      settled.current = true;
      patch({ status: "ready", suggestion, memoryAnalysisCount: suggestion.memoryAnalysisCount });
    } catch (err) {
      settled.current = true;
      patch({ status: "error", error: err instanceof Error ? err.message : "Erro" });
    } finally {
      inFlight.current = false;
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        void process(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = (msg: RuntimeMessage) => {
      if (msg.type === "MORUBI_CONVERSATION_UPDATE") void process(msg);
    };
    chrome.runtime.onMessage.addListener(listener);
    // Pede um snapshot inicial à aba ativa.
    void requestSnapshot();
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [process]);

  const reanalyze = useCallback(async () => {
    if (!conversationId.current) return;
    patch({ status: "analyzing", error: null });
    try {
      const suggestion = await api.analyze(conversationId.current, {});
      hasSuggestion.current = true;
      settled.current = true;
      patch({ status: "ready", suggestion, memoryAnalysisCount: suggestion.memoryAnalysisCount });
    } catch (err) {
      settled.current = true;
      patch({ status: "error", error: err instanceof Error ? err.message : "Erro" });
    }
  }, []);

  /** "Analisar mesmo assim": ignora o aviso de leitura incerta. */
  const forceAnalyze = useCallback(() => {
    forced.current = true;
    if (lastUpdate.current) void process(lastUpdate.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process]);

  // Registra o desfecho da conversa ATUAL (por id explícito, nunca "a última
  // que resolveu" — evita marcar a conversa errada caso o vendedor troque de
  // chat rápido demais entre o clique e a resposta da API).
  const markOutcome = useCallback(
    async (targetConversationId: string, outcome: Outcome, dealValue?: number | null) => {
      await api.setOutcome(targetConversationId, {
        outcome: outcome as "GANHA" | "PERDIDA",
        dealValue: dealValue ?? null,
      });
      // Só reflete no painel se ainda estivermos na mesma conversa.
      if (conversationId.current === targetConversationId) {
        patch({ outcome });
      }
    },
    [],
  );

  return {
    state,
    reanalyze,
    markOutcome,
    forceAnalyze,
    lastClientMessage: state.lastClientMessage,
  };
}

async function requestSnapshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs
      .sendMessage(tab.id, { type: "MORUBI_REQUEST_SNAPSHOT" })
      .catch(() => {
        /* content script não injetado nesta aba */
      });
  }
}
