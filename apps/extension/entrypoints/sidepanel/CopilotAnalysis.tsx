import { probabilityColor } from "@morubi/ui-tokens";
import { SELLER_MISTAKE_LABEL, type AnalyzeResponse, type SellerMistake } from "@morubi/api-client";
import { TimelineItem } from "./TimelineItem";

const STAGE_LABEL: Record<string, string> = {
  descoberta: "Descoberta",
  consideracao: "Consideração",
  negociacao: "Negociação",
  fechamento: "Fechamento",
};

export function CopilotAnalysis({
  suggestion,
  lastClientMessage,
  refreshing,
}: {
  suggestion: AnalyzeResponse;
  lastClientMessage: string | null;
  refreshing: boolean;
}) {
  const color = probabilityColor(suggestion.probability);
  const hasObjection = !!suggestion.objection;

  return (
    <div className="space-y-1">
      {refreshing && (
        <div className="mb-3 flex items-center gap-2 text-xs text-ink-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          Atualizando análise
        </div>
      )}

      {/* Estágio + probabilidade */}
      <div className="mb-4 rounded-xl border border-graphite-700 bg-graphite-900/70 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
            Estágio
          </span>
          <span className="rounded-full bg-graphite-700 px-2.5 py-0.5 text-xs font-medium text-ink-200">
            {STAGE_LABEL[suggestion.stage] ?? suggestion.stage}
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs text-ink-400">Chance de fechamento</span>
          <span className="text-3xl font-semibold tracking-tight" style={{ color }}>
            {suggestion.probability}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-graphite-700">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${suggestion.probability}%`, backgroundColor: color }}
          />
        </div>
      </div>

      {/* Timeline */}
      {lastClientMessage && (
        <TimelineItem icon="💬" label="Cliente">
          <div className="rounded-xl rounded-tl-sm border border-graphite-700 bg-graphite-800/60 px-3.5 py-2.5 text-sm text-ink-200">
            {lastClientMessage}
          </div>
        </TimelineItem>
      )}

      {hasObjection && (
        <TimelineItem icon="⚠" label="Objeção detectada" tone="warning">
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3">
            <p className="text-sm font-medium text-warning">{suggestion.objection}</p>
            {suggestion.objectionReply && (
              <>
                <div className="mt-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-500">
                  Como contornar
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-100">
                  {suggestion.objectionReply}
                </p>
              </>
            )}
          </div>
        </TimelineItem>
      )}

      <TimelineItem icon="✦" label="Morubi" tone="brand" last={suggestion.mistakes.length === 0}>
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-3.5 py-3">
          {suggestion.reasoning && (
            <p className="mb-2 text-xs leading-relaxed text-ink-300">{suggestion.reasoning}</p>
          )}
          <div className="text-[10px] font-medium uppercase tracking-wider text-brand-300">
            Sugestão de resposta
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-100">{suggestion.nextAction}</p>
        </div>

        {suggestion.citedKnowledge.length > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Baseado em: {suggestion.citedKnowledge.map((k) => k.title).join(" · ")}
          </p>
        )}
      </TimelineItem>

      {suggestion.mistakes.length > 0 && (
        <TimelineItem icon="↺" label="Pontos de atenção" last>
          <ul className="space-y-1.5">
            {suggestion.mistakes.map((mk) => (
              <li
                key={mk}
                className="rounded-lg border border-graphite-700 bg-graphite-800/40 px-3 py-2 text-xs text-ink-300"
              >
                {SELLER_MISTAKE_LABEL[mk as SellerMistake] ?? mk}
              </li>
            ))}
          </ul>
        </TimelineItem>
      )}
    </div>
  );
}
