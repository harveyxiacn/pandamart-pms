import type { ReactNode } from "react";
import { cn } from "../../utils/classnames";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Small label above the title, e.g. 「进货管理」. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Secondary line under the description — timestamps, counts, sync state. */
  meta?: ReactNode;
  className?: string;
}

/**
 * The first thing on every screen. One title level, one description line and
 * one action cluster keeps page rhythm identical across the app.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-label font-semibold uppercase tracking-[0.12em] text-ink-subtle">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-display font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
        ) : null}
        {meta ? <div className="mt-1.5 text-meta text-ink-subtle">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
