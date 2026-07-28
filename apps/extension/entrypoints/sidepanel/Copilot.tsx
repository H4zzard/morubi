import { useEffect, useState } from "react";
import { LogoMark } from "@morubi/ui-tokens/logo";
import type { Outcome } from "@morubi/api-client";
import { supabase } from "@/lib/supabase";
import { useCopilot } from "./useCopilot";
import { useChat } from "./useChat";
import { CopilotAnalysis } from "./CopilotAnalysis";
import { CopilotChat } from "./CopilotChat";

const STATUS_LABEL: Record<string, string> = {
  idle: "Iniciando",
  "no-chat": "Abra uma conversa para o Morubi acompanhar",
  syncing: "Sincronizando conversa",
  analyzing: "Analisando",
  ready: "",
  error: "Erro",
};

type Tab = "copiloto" | "chat";

export function Copilot() {
  const { state, reanalyze, markOutcome, forceAnalyze, lastClientMessage } = useCopilot();
  const { suggestion, status } = state;
  const chat = useChat(state.conversationId);

  const [tab, setTab] = useState<Tab>("copiloto");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [dealValue, setDealValue] = useState("");

  // Ao trocar de conversa, o valor digitado não pode vazar para o próximo lead.
  useEffect(() => {
    setDealValue("");
    setTab("copiloto");
  }, [state.conversationId]);

  async function setOutcome(outcome: Outcome) {
    if (!state.conversationId) return;
    setSavingOutcome(true);
    try {
      const cents = dealValue ? Math.round(parseFloat(dealValue.replace(",", ".")) * 100) : null;
      await markOutcome(state.conversationId, outcome, Number.isFinite(cents!) ? cents : null);
    } finally {
      setSavingOutcome(false);
    }
  }

  const showBusy = status === "analyzing" && !suggestion;
  const showStatus = status !== "ready" && status !== "analyzing";

  return (
    <div className="flex h-full flex-col bg-graphite-950">
      {/* Cabeçalho */}
      <header className="border-b border-graphite-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <LogoMark className="h-5 w-5 shrink-0 text-brand-500" />
            <span className="truncate text-sm font-semibold text-ink-100">
              {state.chat?.leadName ?? "Morubi"}
            </span>
          </div>
          <button
            onClick={() => supabase().auth.signOut()}
            className="shrink-0 text-xs text-ink-500 transition-colors hover:text-ink-200"
          >
            Sair
          </button>
        </div>

        {state.memoryAnalysisCount > 1 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-300">
            <span aria-hidden="true">🧠</span>
            Retomando de onde parou · {state.memoryAnalysisCount} análises deste contato
          </div>
        )}
      </header>

      {/* Abas */}
      <div className="flex gap-1 border-b border-graphite-800 px-3 pt-2">
        {(["copiloto", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? "text-ink-100" : "text-ink-500 hover:text-ink-300"
            }`}
          >
            {t === "copiloto" ? "Copiloto" : "Falar com o Morubi"}
            {tab === t && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "chat" ? (
        <div className="min-h-0 flex-1">
          <CopilotChat
            messages={chat.messages}
            onSend={(text) => {
              void chat.send(text).then((res) => {
                // Correção nova muda o que o Morubi sabe: reanalisa para o
                // painel refletir o aprendizado sem o vendedor pedir.
                if (res.correction) void reanalyze();
              });
            }}
            sending={chat.sending}
            error={chat.error}
            disabled={!state.conversationId}
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {status === "uncertain" && (
              <div className="mt-10 px-4 text-center">
                <span className="text-2xl" aria-hidden="true">🧐</span>
                <p className="mt-2 text-sm text-ink-200">
                  Não consegui ler esta conversa com segurança
                </p>
                <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-500">
                  Este CRM ainda não é totalmente reconhecido, então prefiro não arriscar uma
                  análise errada. Você pode analisar mesmo assim.
                </p>
                <button
                  onClick={() => forceAnalyze()}
                  className="mt-4 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-graphite-950 transition-colors hover:bg-brand-400"
                >
                  Analisar mesmo assim
                </button>
              </div>
            )}

            {showStatus && status !== "uncertain" && (
              <div className="mt-10 px-4 text-center">
                <p className="text-sm text-ink-400">{STATUS_LABEL[status]}</p>
                {status === "error" && state.error && (
                  <>
                    <p className="mt-2 text-xs leading-relaxed text-danger">{state.error}</p>
                    <button
                      onClick={() => void reanalyze()}
                      className="mt-3 rounded-lg border border-graphite-600 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-graphite-800"
                    >
                      Tentar novamente
                    </button>
                  </>
                )}
              </div>
            )}

            {showBusy && (
              <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                Analisando a conversa
              </div>
            )}

            {suggestion && (
              <CopilotAnalysis
                suggestion={suggestion}
                lastClientMessage={lastClientMessage}
                refreshing={status === "analyzing"}
              />
            )}
          </div>

          {/* Desfecho */}
          {suggestion && (
            <footer className="border-t border-graphite-800 p-3">
              {state.outcome ? (
                <p className="text-center text-xs text-brand-300">
                  Desfecho registrado: {state.outcome === "GANHA" ? "Ganha ✓" : "Perdida"}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-500">R$</span>
                    <input
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value.replace(/[^\d.,]/g, ""))}
                      inputMode="decimal"
                      placeholder="Valor do negócio (opcional)"
                      className="flex-1 rounded-lg border border-graphite-700 bg-graphite-900 px-2.5 py-1.5 text-xs text-ink-100 outline-none placeholder:text-ink-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void setOutcome("GANHA")}
                      disabled={savingOutcome}
                      className="flex-1 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-graphite-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
                    >
                      Marcar ganha
                    </button>
                    <button
                      onClick={() => void setOutcome("PERDIDA")}
                      disabled={savingOutcome}
                      className="flex-1 rounded-lg border border-graphite-600 px-3 py-2 text-sm text-ink-200 transition-colors hover:bg-graphite-800 disabled:opacity-50"
                    >
                      Perdida
                    </button>
                  </div>
                </div>
              )}
            </footer>
          )}
        </>
      )}
    </div>
  );
}
