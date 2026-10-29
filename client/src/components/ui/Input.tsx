import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

export const fieldStyles =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-ink-subtle/70 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:bg-surface-inset disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldStyles, "min-h-24 resize-y", className)} {...props} />;
}
