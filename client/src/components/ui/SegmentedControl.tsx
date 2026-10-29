import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/classnames";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Shown but not selectable — use when a mode needs configuration first. */
  disabled?: boolean;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Filter switch for a single list. Implemented as a group of pressed buttons
 * rather than tabs: it filters the same table instead of swapping panels, so
 * `aria-pressed` describes it more honestly than `role="tab"`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-lg border border-line bg-surface-muted p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-disabled={option.disabled || undefined}
            title={option.title}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "h-7 px-2 text-meta" : "h-8 px-2.5 text-body",
              active
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
              option.disabled && "cursor-not-allowed opacity-45 hover:text-ink-muted"
            )}
          >
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[10px] font-semibold",
                  active ? "bg-surface-inset text-ink-muted" : "bg-surface-inset/70 text-ink-subtle"
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
