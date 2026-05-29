import type { SelectHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-pine focus:ring-2 focus:ring-pine/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
