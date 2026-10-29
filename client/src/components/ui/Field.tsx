import { useId, type ReactNode } from "react";
import { cn } from "../../utils/classnames";

interface FieldProps {
  label?: ReactNode;
  /** Bind the visible label to the control. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error. The label is always visible — placeholder-only
 * forms are unusable once the user starts typing, and unreadable to screen
 * readers.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const hintId = useId();
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="field-label flex items-baseline gap-1">
          {label}
          {required ? (
            <span className="field-required text-danger" aria-hidden="true" />
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={hintId} className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-meta text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
