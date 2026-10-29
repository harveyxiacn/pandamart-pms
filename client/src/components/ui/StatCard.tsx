import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "../../utils/classnames";

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

interface TrendProps {
  current: number;
  previous: number;
  label?: string;
  /** False for metrics where a rise is bad (alerts, overdue invoices). */
  positiveGood?: boolean;
  className?: string;
}

export function Trend({ current, previous, label, positiveGood = true, className }: TrendProps) {
  const pct = percentChange(current, previous);
  if (pct === null) {
    return <span className={cn("text-meta text-ink-subtle", className)}>—{label ? ` ${label}` : ""}</span>;
  }
  if (pct === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-meta text-ink-subtle", className)}>
        <Minus size={12} aria-hidden="true" />
        持平{label ? ` · ${label}` : ""}
      </span>
    );
  }
  const up = pct > 0;
  const good = up === positiveGood;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-meta font-medium", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 tabular",
          good ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
        )}
      >
        {up ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
        {up ? "+" : ""}
        {pct}%
      </span>
      {label ? <span className="ml-1 text-ink-subtle">{label}</span> : null}
    </span>
  );
}

const toneMap = {
  neutral: "bg-surface-inset text-ink-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof toneMap;
  hint?: ReactNode;
  delta?: { current: number; previous: number; label: string; positiveGood?: boolean };
  to?: string;
  sparkline?: number[];
  className?: string;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 26 - ((value - min) / span) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="h-8 w-24 text-accent"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  delta,
  to,
  sparkline,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-meta font-medium text-ink-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              toneMap[tone]
            )}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[22px] font-semibold leading-7 tracking-tight text-ink tabular sm:text-[26px] sm:leading-8">
        {value}
      </p>
      <div className="mt-2 flex min-h-[24px] items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {delta ? (
            <Trend
              current={delta.current}
              previous={delta.previous}
              label={delta.label}
              positiveGood={delta.positiveGood}
            />
          ) : null}
          {hint ? <span className="text-meta text-ink-subtle">{hint}</span> : null}
        </div>
        {sparkline ? <Sparkline values={sparkline} /> : null}
      </div>
    </>
  );

  const classes = cn(
    "surface block p-4 transition-[box-shadow,border-color] duration-150 sm:p-5",
    to && "hover:border-line-strong hover:shadow-card-hover",
    className
  );

  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
