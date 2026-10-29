import { cn } from "../../utils/classnames";

export function Spinner({ className, label = "加载中" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
