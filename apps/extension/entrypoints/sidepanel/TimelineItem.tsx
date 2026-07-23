// Item da timeline do copiloto (estrutura visual: ícone + trilho + conteúdo).
import type { ReactNode } from "react";

export function TimelineItem({
  icon,
  label,
  tone = "neutral",
  last = false,
  children,
}: {
  icon: string;
  label: string;
  tone?: "neutral" | "brand" | "warning" | "success";
  last?: boolean;
  children: ReactNode;
}) {
  const iconTones = {
    neutral: "bg-graphite-700 text-ink-300",
    brand: "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30",
    warning: "bg-warning/15 text-warning ring-1 ring-warning/30",
    success: "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30",
  };

  return (
    <div className="relative flex gap-3">
      {/* Trilho vertical ligando os itens */}
      {!last && (
        <span
          className="absolute left-[13px] top-7 bottom-0 w-px bg-graphite-700"
          aria-hidden="true"
        />
      )}
      <span
        className={`relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs ${iconTones[tone]}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ink-500">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}
