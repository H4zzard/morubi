import { useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@morubi/api-client";

const SUGGESTED_PROMPTS = [
  "Como respondo essa objeção?",
  "Esse lead vale a pena insistir?",
  "Escreve uma mensagem de follow-up",
];

export function CopilotChat({
  messages,
  onSend,
  sending,
  error,
  disabled,
}: {
  messages: ChatMessageDTO[];
  onSend: (text: string) => void;
  sending: boolean;
  error: string | null;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  function submit(text: string) {
    const value = text.trim();
    if (!value || sending || disabled) return;
    onSend(value);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3 pt-4">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-ink-300">Fale com o Morubi</p>
            <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-ink-500">
              Tire dúvidas sobre a venda ou corrija o que ele errou. Toda correção vira memória e
              vale nas próximas conversas.
            </p>
            <div className="mt-4 space-y-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => submit(p)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-graphite-700 bg-graphite-800/40 px-3 py-2 text-left text-xs text-ink-300 transition-colors hover:border-graphite-600 hover:text-ink-100 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const mine = m.role === "VENDEDOR";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  mine
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-3.5 py-2 text-sm text-graphite-950"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm border border-graphite-700 bg-graphite-800/70 px-3.5 py-2 text-sm leading-relaxed text-ink-100"
                }
              >
                {m.content}
                {m.savedCorrection && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-brand-300">
                    <span aria-hidden="true">✓</span> Correção salva na memória
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-graphite-700 bg-graphite-800/70 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {error && <p className="text-center text-xs text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-graphite-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? "Abra uma conversa para começar" : "Pergunte ou corrija..."}
            className="max-h-24 flex-1 resize-none rounded-xl border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
          />
          <button
            onClick={() => submit(draft)}
            disabled={sending || disabled || !draft.trim()}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-graphite-950 transition-opacity hover:bg-brand-400 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
