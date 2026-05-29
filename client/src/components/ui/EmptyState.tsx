import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/classnames";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-10 text-center", className)}>
      {Icon ? <Icon size={40} className="text-slate-300" strokeWidth={1.5} /> : null}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description ? <p className="max-w-sm text-xs text-slate-400">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
