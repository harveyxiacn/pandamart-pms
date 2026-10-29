import type { PropsWithChildren } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "../../utils/classnames";

interface TableProps {
  className?: string;
  tableClassName?: string;
  /** Caps the body height so the sticky header stays visible on long lists. */
  maxHeight?: string;
}

/**
 * Table shell. Row/header styling comes from `.data-table` in globals.css so
 * every list in the app shares one density and hover treatment.
 */
export function Table({ className, tableClassName, maxHeight, children }: PropsWithChildren<TableProps>) {
  return (
    <div className={cn("data-table", className)} style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className={tableClassName}>{children}</table>
    </div>
  );
}

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  numeric?: boolean;
}

export function Th({
  sortable,
  sortDirection,
  onSort,
  numeric,
  className,
  children,
  ...props
}: ThProps) {
  if (!sortable) {
    return (
      <th className={cn(numeric && "num", className)} {...props}>
        {children}
      </th>
    );
  }
  const Icon = sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <th
      aria-sort={sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none"}
      className={cn(numeric && "num", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm uppercase tracking-[0.06em] transition-colors hover:text-ink",
          sortDirection ? "text-ink" : "",
          numeric && "flex-row-reverse"
        )}
      >
        {children}
        <Icon size={12} aria-hidden="true" className="opacity-60" />
      </button>
    </th>
  );
}

export function Td({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn(numeric && "num", className)} {...props} />;
}
