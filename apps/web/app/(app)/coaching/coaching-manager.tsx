"use client";

import { useState } from "react";
import type { CoachingReportDTO } from "@morubi/api-client";
import { browserApi } from "@/lib/api-browser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Render simples de markdown: **negrito** e listas com "- ". */
function ReportBody({ content }: { content: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink-300">
      {content.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;

        const isHeading = /^\*\*(.+)\*\*:?$/.test(trimmed);
        if (isHeading) {
          return (
            <p key={i} className="pt-2 text-sm font-semibold text-ink-100">
              {trimmed.replace(/\*\*/g, "").replace(/:$/, "")}
            </p>
          );
        }

        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const text = isBullet ? trimmed.slice(2) : trimmed;
        // Negrito inline
        const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const rendered = parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-medium text-ink-100">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{p}</span>
          ),
        );

        return isBullet ? (
          <div key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
            <p>{rendered}</p>
          </div>
        ) : (
          <p key={i}>{rendered}</p>
        );
      })}
    </div>
  );
}

export function CoachingManager({
  initialReports,
  initialDays,
}: {
  initialReports: CoachingReportDTO[];
  initialDays: number[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [days, setDays] = useState<number[]>(initialDays);
  const [savingDays, setSavingDays] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    setDays(next);
    setSavingDays(true);
    setError(null);
    try {
      await browserApi().setCoachingSchedule({ days: next });
    } catch (err) {
      setDays(days); // reverte
      setError(err instanceof Error ? err.message : "Falha ao salvar os dias");
    } finally {
      setSavingDays(false);
    }
  }

  async function generateNow() {
    setGenerating(true);
    setError(null);
    try {
      const res = await browserApi().generateCoaching();
      setReports((prev) => [...res.reports, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o coaching");
    } finally {
      setGenerating(false);
    }
  }

  // Agrupa por rodada de geração (mesmo createdAt aproximado = mesma execução).
  const grouped = reports.reduce<Record<string, CoachingReportDTO[]>>((acc, r) => {
    const key = new Date(r.createdAt).toISOString().slice(0, 16);
    (acc[key] ??= []).push(r);
    return acc;
  }, {});
  const rounds = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-6">
      {/* Agenda + gerar agora */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink-100">Agenda automática</h2>
            <p className="mt-0.5 text-sm text-ink-400">
              Nos dias marcados, o Morubi gera o coaching de cada vendedor sozinho.
            </p>
          </div>
          <Button onClick={generateNow} disabled={generating}>
            {generating ? "Analisando o time..." : "Gerar agora"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const active = days.includes(d.value);
            return (
              <button
                key={d.value}
                onClick={() => toggleDay(d.value)}
                disabled={savingDays}
                className={cn(
                  "rounded-lg border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-50",
                  active
                    ? "border-brand-500 bg-brand-500/15 text-brand-300"
                    : "border-graphite-600 text-ink-400 hover:border-graphite-500 hover:text-ink-200",
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {days.length === 0 && (
          <p className="text-xs text-ink-500">
            Nenhum dia marcado: o coaching só roda quando você clicar em "Gerar agora".
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {generating && (
          <p className="text-xs text-ink-400">
            Isso leva alguns minutos, porque o Morubi lê as conversas de cada vendedor.
          </p>
        )}
      </Card>

      {/* Relatórios */}
      {rounds.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-400">
            Nenhum relatório ainda. Clique em "Gerar agora" para o Morubi analisar o time.
          </p>
        </Card>
      ) : (
        rounds.map(([key, group]) => (
          <div key={key} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink-200">
                {new Date(group[0]!.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                })}
              </h2>
              <Badge tone={group[0]!.source === "auto" ? "success" : "default"}>
                {group[0]!.source === "auto" ? "automático" : "manual"}
              </Badge>
              <span className="text-xs text-ink-500">
                período {formatDate(group[0]!.periodStart)} a {formatDate(group[0]!.periodEnd)}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {group.map((r) => (
                <Card key={r.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-ink-100">{r.userName}</h3>
                    <span className="text-xs text-ink-500">
                      {r.conversationsAnalyzed} conversa
                      {r.conversationsAnalyzed === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ReportBody content={r.content} />
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
