import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/classnames";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-ghost"
  | "link";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Replaces the label with a spinner and blocks interaction. */
  loading?: boolean;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Square icon-only button; the label becomes the accessible name. */
  iconOnly?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const base =
  "inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold " +
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-standard " +
  "disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0";

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-body",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-sm",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-card hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border border-line-strong bg-surface text-ink shadow-card hover:border-ink-subtle hover:bg-surface-muted active:bg-surface-inset",
  ghost: "text-ink-muted hover:bg-surface-inset hover:text-ink active:bg-surface-inset",
  danger: "bg-danger text-white shadow-card hover:bg-danger/90 active:bg-danger/90",
  "danger-ghost": "text-danger hover:bg-danger-soft active:bg-danger-soft",
  link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon: Leading,
    trailingIcon: Trailing,
    iconOnly = false,
    fullWidth = false,
    type = "button",
    disabled,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        variant === "link" ? "" : sizes[size],
        iconOnly && variant !== "link" ? iconSizes[size] : "",
        iconOnly && "px-0",
        fullWidth && "w-full",
        variants[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : Leading ? (
        <Leading size={size === "sm" ? 14 : 16} aria-hidden="true" />
      ) : null}
      {children}
      {Trailing && !loading ? (
        <Trailing size={size === "sm" ? 14 : 16} aria-hidden="true" />
      ) : null}
    </button>
  );
});
