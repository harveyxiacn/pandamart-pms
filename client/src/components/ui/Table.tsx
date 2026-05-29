import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface TableProps {
  className?: string;
}

export function Table({ className, children }: PropsWithChildren<TableProps>) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-200", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}
