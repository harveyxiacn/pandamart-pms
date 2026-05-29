import { Button } from "./Button";
import { Select } from "./Select";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        第 {currentPage} / {totalPages} 页，共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            className="w-28"
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
        <Button variant="ghost" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
          上一页
        </Button>
        <Button variant="ghost" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
          下一页
        </Button>
      </div>
    </div>
  );
}
