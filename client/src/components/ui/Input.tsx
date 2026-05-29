import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-pine focus:ring-2 focus:ring-pine/20",
        className
      )}
      {...props}
    />
  );
}
