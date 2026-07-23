import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { computeOverview } from "@/lib/metrics";
import { Sparkline, MeterBar, ActivityBars, TrendPill } from "@/components/dashboard/charts";
import { LogoMark } from "@morubi/ui-tokens/logo";
import { cn } from "@/lib/utils";

// O insight custa uma chamada de LLM; revalidar de tempos em tempos evita
// pagar isso a cada F5 do gestor.
export const revalidate = 300;

function formatBRL(cents: number): string {
  const value = cents / 100;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-graphite-700/70 bg-graphite-900/60 p-5 backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-100">
      <span aria-hidden="true">{icon}</span>
      {children}
    </h2>
  );
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx?.user) redirect("/login");
  const { user } = ctx;
  const isGestor = user.role === "GESTOR";

  const overview = await computeOverview({
    role: user.role,
    userId: user.id,
    tenantId: user.tenantId,
    withInsight: isGestor,
    tenantName: user.tenant.name,
  });
  const m = overview.macro;

  return (
    <div className="space-y-4">
      {/* Barra de título estilo app */}
      <div className="flex items-center justify-between rounded-xl border border-graphite-700/70 bg-graphite-900/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-5 w-5 text-brand-500" />
          <span className="text-sm text-ink-300">
            Morubi · {isGestor ? "Visão do gestor" : "Meus números"}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ink-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          Atualizado agora
        </span>
      </div>

      {m.openObjections > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <span aria-hidden="true">⚠</span>
          {m.openObjections} objeç{m.openObjections > 1 ? "ões" : "ão"} sem resposta
        </div>
      )}

      {/* Linha 1: métricas principais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <div className="flex items-start justify-between">
            <span className="text-sm text-ink-400">Conversão</span>
            <TrendPill value={m.winRateTrend} suffix="%" />
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-ink-100">
            {m.winRate}%
          </div>
          <div className="mt-3">
            <Sparkline data={m.winRateSeries} />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            {m.won} ganhas · {m.lost} perdidas · {m.open} em aberto
          </p>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between">
            <span className="text-sm text-ink-400">Receita projetada</span>
            <TrendPill value={m.projectedRevenueTrend} suffix="%" />
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-ink-100">
            {formatBRL(m.projectedRevenue)}
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Soma dos negócios em aberto ponderada pela chance de fechamento.
          </p>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between">
            <span className="text-sm text-ink-400">Leads quentes</span>
            <span aria-hidden="true">🔥</span>
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-ink-100">
            {m.hotLeads}
          </div>
          <p className="mt-1 text-xs text-ink-500">{m.hotLeadsNew} novos nas últimas 24h</p>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-400">Alta intenção</span>
                <span className="text-ink-300">{m.highIntentPct}%</span>
              </div>
              <MeterBar value={m.highIntentPct} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-400">Em negociação</span>
                <span className="text-ink-300">{m.negotiatingPct}%</span>
              </div>
              <MeterBar value={m.negotiatingPct} tone="warning" />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between">
            <span className="text-sm text-ink-400">Vendas em risco</span>
            <span aria-hidden="true">⚠</span>
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-ink-100">
            {formatBRL(m.atRiskRevenue)}
          </div>
          <p className="mt-1 text-xs text-danger">
            {m.atRiskDeals} negócio{m.atRiskDeals === 1 ? "" : "s"}
          </p>
          <p className="mt-3 text-xs text-ink-500">
            Sem resposta há dias ou com objeção em aberto.
          </p>
        </Panel>
      </div>

      {/* Linha 2: ranking · erros · insight */}
      <div className="grid gap-4 lg:grid-cols-3">
        {isGestor && (
          <Panel>
            <PanelTitle icon="🏆">Ranking de vendedores</PanelTitle>
            {overview.perSeller.length === 0 ? (
              <p className="text-sm text-ink-400">Nenhuma conversa registrada ainda.</p>
            ) : (
              <ol className="space-y-3">
                {overview.perSeller.slice(0, 6).map((s, i) => (
                  <li key={s.userId} className="flex items-center gap-3">
                    <span className="w-3 text-xs text-ink-500">{i + 1}</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-700 text-[10px] font-medium text-ink-200">
                      {initials(s.name)}
                    </span>
                    <span className="w-28 shrink-0 truncate text-sm text-ink-100">{s.name}</span>
                    <MeterBar value={s.winRate} className="flex-1" />
                    <span className="w-9 shrink-0 text-right text-sm text-ink-200">
                      {s.winRate}%
                    </span>
                    <span
                      className={cn(
                        "w-8 shrink-0 text-right text-xs",
                        s.trend > 0 ? "text-brand-400" : s.trend < 0 ? "text-danger" : "text-ink-500",
                      )}
                    >
                      {s.trend > 0 ? `+${s.trend}` : s.trend || "–"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}

        <Panel className={isGestor ? undefined : "lg:col-span-2"}>
          <PanelTitle icon="⚠">Erros mais comuns</PanelTitle>
          {overview.commonMistakes.length === 0 ? (
            <p className="text-sm text-ink-400">
              Nenhum erro recorrente detectado. Conforme o time usar o copiloto, os padrões
              aparecem aqui.
            </p>
          ) : (
            <ul className="space-y-3">
              {overview.commonMistakes.map((mk) => (
                <li key={mk.mistake}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm text-ink-200">{mk.label}</span>
                    <span className="text-xs text-ink-400">{mk.pct}%</span>
                  </div>
                  <MeterBar value={mk.pct} tone="warning" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {isGestor && (
          <Panel>
            <PanelTitle icon="✦">Insight do Morubi</PanelTitle>
            {overview.insight ? (
              <p className="text-sm leading-relaxed text-ink-200">{overview.insight}</p>
            ) : (
              <p className="text-sm text-ink-400">
                Ainda não há dados suficientes para um insight confiável. Registre desfechos das
                conversas para o Morubi encontrar padrões.
              </p>
            )}
          </Panel>
        )}
      </div>

      {/* Linha 3: leads em risco · equipe */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelTitle icon="⚠">Leads em risco</PanelTitle>
          {overview.atRiskLeads.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum lead esfriando no momento.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {overview.atRiskLeads.map((l) => (
                <div
                  key={l.conversationId}
                  className="flex items-center justify-between rounded-lg border border-graphite-700 bg-graphite-800/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-100">{l.leadName}</div>
                    <div className="truncate text-xs text-ink-400">{l.reason}</div>
                  </div>
                  <span className="ml-3 shrink-0 text-sm font-medium text-danger">
                    {l.probability}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle icon="👥">{isGestor ? "Equipe ativa" : "Sua atividade"}</PanelTitle>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-semibold text-ink-100">
                {overview.team.online}
                <span className="text-lg text-ink-500">/{overview.team.total}</span>
              </div>
              <p className="mt-1 text-xs text-ink-400">
                {isGestor ? "vendedores ativos hoje" : "conversas ativas hoje"}
              </p>
            </div>
            <ActivityBars data={overview.team.activitySeries} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
