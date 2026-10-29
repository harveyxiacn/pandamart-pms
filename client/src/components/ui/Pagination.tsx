import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Select } from "./Select";
import { cn } from "../../utils/classnames";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

/** First, last, current ±1, with ellipses where the gap is bigger. */
function pageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - (sorted[index - 1] as number) > 1) result.push("gap");
    result.push(p);
  });
  return result;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(total, currentPage * pageSize);

  return (
    <nav
      aria-label="分页"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 pt-3 text-meta text-ink-muted"
    >
      <p className="tabular" aria-live="polite">
        显示 <span className="font-medium text-ink">{from}–{to}</span>，共{" "}
        <span className="font-medium text-ink">{total}</span> 条
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            className="w-[7.25rem]"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="每页条数"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                每页 {option} 条
              </option>
            ))}
          </Select>
        ) : null}

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="上一页"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>

          {pageWindow(currentPage, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-ink-subtle" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`第 ${item} 页`}
                aria-current={item === currentPage ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  "h-8 min-w-8 rounded-md px-1.5 text-body font-medium tabular transition-colors",
                  item === currentPage
                    ? "bg-ink text-white"
                    : "text-ink-muted hover:bg-surface-inset hover:text-ink"
                )}
              >
                {item}
              </button>
            )
          )}

          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="下一页"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
