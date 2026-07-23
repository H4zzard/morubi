// Gráficos leves do dashboard, em SVG inline (sem dependência de lib de chart).
import { cn } from "@/lib/utils";

/** Linha de tendência compacta usada dentro dos cards de métrica. */
export function Sparkline({
  data,
  className,
  stroke = "#12B866",
}: {
  data: number[];
  className?: string;
  stroke?: string;
}) {
  if (data.length < 2) return null;

  const W = 100;
  const H = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${W},${H} 0,${H}`;
  const gradientId = `spark-${stroke.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Barra horizontal de progresso (ranking, erros, intenção). */
export function MeterBar({
  value,
  tone = "brand",
  className,
}: {
  /** 0..100 */
  value: number;
  tone?: "brand" | "warning" | "danger";
  className?: string;
}) {
  const colors = {
    brand: "bg-brand-500",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-graphite-700", className)}>
      <div
        className={cn("h-full rounded-full transition-all", colors[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** Barras verticais de atividade (card "Equipe ativa"). */
export function ActivityBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-sm bg-brand-500/70"
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Seta de tendência com sinal e cor semântica. */
export function TrendPill({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-brand-400" : "text-danger",
      )}
    >
      {up ? "↗" : "↘"} {up ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}
