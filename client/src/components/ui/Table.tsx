import type { PropsWithChildren } from "react";
import { cn } from "../../utils/classnames";

interface TableProps {
  className?: string;
}

export function Table({ className, children }: PropsWithChildren<TableProps>) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-line bg-surface", className)}>
      <table className="min-w-full divide-y divide-line text-sm tabular">{children}</table>
    </div>
  );
}
