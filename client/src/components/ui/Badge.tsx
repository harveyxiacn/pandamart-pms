import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface BadgeProps {
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}

// Tone is never the only signal: pages pair these with an icon or a word, so
// the meaning survives for colour-blind users and in high-contrast mode.
const toneMap: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-surface-inset text-ink-muted ring-1 ring-inset ring-line",
  success: "bg-success-soft text-success ring-1 ring-inset ring-success/20",
  warning: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/20",
  danger: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/20",
};

export function Badge({ children, className, tone = "default" }: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        toneMap[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
