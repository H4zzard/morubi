import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@morubi/api-client";
import { api } from "@/lib/api";

/**
 * Chat do vendedor com o Morubi. O histórico é por conversa, então ao trocar de
 * chat no WhatsApp/Kentro recarregamos o histórico daquela conversa (e nunca
 * mostramos mensagens de uma conversa em outra).
 */
export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCorrection, setLastCorrection] = useState<string | null>(null);

  // Evita que a resposta de um fetch antigo sobrescreva o histórico do chat novo.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    setError(null);
    setLastCorrection(null);
    if (!conversationId) {
      setMessages([]);
      loadedFor.current = null;
      return;
    }
    loadedFor.current = conversationId;
    setMessages([]);
    api
      .getChat(conversationId)
      .then((res) => {
        if (loadedFor.current === conversationId) setMessages(res.messages);
      })
      .catch(() => {
        /* histórico é best-effort: o chat funciona mesmo sem ele */
      });
  }, [conversationId]);

  /**
   * Envia e RETORNA o resultado. O retorno importa: quem chama precisa saber
   * se houve correção para disparar a reanálise, e ler `lastCorrection` do
   * estado logo após o await pegaria o valor do render anterior (closure obsoleta).
   */
  const send = useCallback(
    async (text: string): Promise<{ correction: string | null }> => {
      const target = conversationId;
      if (!target || !text.trim() || sending) return { correction: null };

      setSending(true);
      setError(null);
      setLastCorrection(null);

      // Otimista: a mensagem do vendedor aparece na hora.
      const optimistic: ChatMessageDTO = {
        id: `tmp-${Date.now()}`,
        role: "VENDEDOR",
        content: text.trim(),
        createdAt: new Date().toISOString(),
        savedCorrection: false,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await api.sendChat(target, { message: text.trim() });
        if (loadedFor.current !== target) return { correction: null }; // trocou de conversa
        setMessages((prev) => [...prev, res.reply]);
        if (res.savedCorrection) {
          setLastCorrection(res.savedCorrection.corrected);
          return { correction: res.savedCorrection.corrected };
        }
        return { correction: null };
      } catch (err) {
        if (loadedFor.current === target) {
          setError(err instanceof Error ? err.message : "Falha ao falar com o Morubi");
          // Desfaz a otimista para não deixar mensagem "fantasma" sem resposta.
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        }
        return { correction: null };
      } finally {
        setSending(false);
      }
    },
    [conversationId, sending],
  );

  return { messages, send, sending, error, lastCorrection };
}
