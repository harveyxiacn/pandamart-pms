import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface BadgeProps {
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}

const toneMap: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-800",
};

export function Badge({ children, className, tone = "default" }: PropsWithChildren<BadgeProps>) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-semibold", toneMap[tone], className)}>
      {children}
    </span>
  );
}
