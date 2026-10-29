import type { ReactNode } from "react";
import { cn } from "../../utils/classnames";

interface ToolbarProps {
  children: ReactNode;
  className?: string;
  /** Stack filters above actions on phones (default). */
  stacked?: boolean;
}

/**
 * Filter/action row that sits directly above a table. Keeps search, filters
 * and page-level actions on one optical line on desktop, and wraps cleanly on
 * narrow screens without each page inventing its own gaps.
 */
export function Toolbar({ children, className, stacked = false }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex gap-2",
        stacked ? "flex-col" : "flex-col lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({
  children,
  className,
  grow = false,
}: {
  children: ReactNode;
  className?: string;
  grow?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", grow && "min-w-0 flex-1", className)}>
      {children}
    </div>
  );
}
