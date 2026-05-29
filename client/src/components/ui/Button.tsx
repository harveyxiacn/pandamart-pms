import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-pine text-white hover:bg-deep",
  secondary: "bg-amber text-ink hover:bg-amber/90",
  danger: "bg-coral text-white hover:bg-coral/90",
  ghost: "bg-white text-ink hover:bg-white/70 border border-slate-200",
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
