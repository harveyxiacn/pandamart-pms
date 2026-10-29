import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/classnames";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** `sm` fits inside cards and table bodies. */
  size?: "sm" | "md";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" ? "gap-1.5 px-4 py-8" : "gap-2 px-6 py-12",
        className
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mb-1 inline-flex items-center justify-center rounded-full bg-surface-inset text-ink-subtle ring-1 ring-inset ring-line",
            size === "sm" ? "h-9 w-9" : "h-12 w-12"
          )}
        >
          <Icon size={size === "sm" ? 16 : 22} strokeWidth={1.6} aria-hidden="true" />
        </span>
      ) : null}
      <p className={cn("font-semibold text-ink", size === "sm" ? "text-body" : "text-body-lg")}>
        {title}
      </p>
      {description ? (
        <p className={cn("max-w-sm text-ink-subtle", size === "sm" ? "text-meta" : "text-sm")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
