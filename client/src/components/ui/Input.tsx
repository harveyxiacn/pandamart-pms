import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors",
        "placeholder:text-ink-subtle",
        "hover:border-ink-subtle",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
        "disabled:cursor-not-allowed disabled:bg-surface-inset disabled:text-ink-subtle",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25",
        className
      )}
      {...props}
    />
  );
}
