import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

type BadgeTone = "default" | "info" | "success" | "warning" | "danger";

interface BadgeProps {
  tone?: BadgeTone;
  size?: "sm" | "md";
  className?: string;
}

// Tone is never the only signal: pages pair these with an icon or a word, so
// the meaning survives for colour-blind users and in high-contrast mode.
const toneMap: Record<BadgeTone, string> = {
  default: "bg-surface-inset text-ink-muted ring-line",
  info: "bg-accent-soft text-accent ring-accent/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
};

export function Badge({
  children,
  className,
  tone = "default",
  size = "md",
}: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-label",
        "font-semibold",
        toneMap[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
