import { cn } from "../../utils/classnames";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn("glass space-y-3 p-4", className)}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 5, className }: SkeletonTableProps) {
  return (
    <div className={cn("space-y-2", className)} aria-label="loading">
      <div className="flex gap-3 border-b border-slate-200 pb-2">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={`head-${index}`} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex gap-3 py-1">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
