import { Search, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/classnames";
import { fieldStyles } from "./Input";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onClear?: () => void;
  containerClassName?: string;
}

export function SearchInput({
  className,
  containerClassName,
  onClear,
  value,
  ...props
}: SearchInputProps) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  return (
    <div className={cn("relative w-full", containerClassName)}>
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        value={value}
        className={cn(
          fieldStyles,
          "h-9 py-0 pl-9 text-sm [&::-webkit-search-cancel-button]:hidden",
          hasValue && onClear ? "pr-9" : "pr-3",
          className
        )}
        {...props}
      />
      {hasValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="清除搜索"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
