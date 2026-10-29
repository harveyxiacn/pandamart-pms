import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../utils/classnames";
import { fieldStyles } from "./Input";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        className={cn(
          fieldStyles,
          "h-9 cursor-pointer appearance-none py-0 pl-3 pr-9 text-sm",
          "bg-surface"
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </div>
  );
}
