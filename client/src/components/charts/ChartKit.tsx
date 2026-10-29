import type { ReactNode } from "react";
import { cn } from "../../utils/classnames";

/** Series colours resolve from the token file, so charts follow the theme. */
export const chartColor = (index: 1 | 2 | 3 | 4 | 5 | 6) => `rgb(var(--chart-${index}))`;
export const chartGrid = "rgb(var(--grid))";
export const chartInk = "rgb(var(--ink-subtle))";

export const axisTick = { fontSize: 11, fill: chartInk };

interface TooltipRow {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipRow[];
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string | number) => string;
  /** Hide rows whose value is zero so the tooltip stays readable. */
  hideZero?: boolean;
}

/**
 * One tooltip for every chart: same padding, type and tabular numbers instead
 * of each page inheriting Recharts' default popup.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  valueFormatter,
  labelFormatter,
  hideZero = false,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((row) => !hideZero || Number(row.value) !== 0);
  if (rows.length === 0) return null;

  return (
    <div className="min-w-[9rem] rounded-lg border border-line bg-surface px-3 py-2 text-meta shadow-pop">
      {label !== undefined && label !== "" ? (
        <p className="mb-1 text-ink-subtle">{labelFormatter ? labelFormatter(label) : label}</p>
      ) : null}
      <div className="space-y-0.5">
        {rows.map((row, index) => (
          <div key={`${row.dataKey ?? index}`} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-ink-muted">
              {row.color ? (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              {row.name ?? row.dataKey}
            </span>
            <span className="font-semibold tabular text-ink">
              {valueFormatter ? valueFormatter(Number(row.value)) : Number(row.value).toLocaleString("zh-CN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendChip({
  color,
  children,
  className,
}: {
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-meta text-ink-muted", className)}>
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}

/** Shared chart margins keep plot areas aligned across cards. */
export const chartMargin = { top: 8, right: 8, left: 0, bottom: 0 };
