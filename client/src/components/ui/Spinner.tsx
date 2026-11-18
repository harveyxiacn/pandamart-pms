import { t, useLanguage } from "../../i18n";
import { cn } from "../../utils/classnames";

export function Spinner({ className, label = t("加载中") }: { className?: string; label?: string }) {
  useLanguage();
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
