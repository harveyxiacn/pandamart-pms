import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-surface-inset active:bg-surface-inset",
  danger: "bg-danger text-white hover:bg-danger/90 active:bg-danger/90",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-inset hover:text-ink",
};

export function Button({ className, variant = "primary", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], className)} {...props} />;
}
