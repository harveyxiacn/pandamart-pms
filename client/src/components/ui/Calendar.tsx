import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/classnames";
import {
  addDays,
  addMonths,
  formatMonth,
  getCalendarCells,
  isBetween,
  isSameDay,
  startOfDay,
  startOfMonth,
  toISODate,
  WEEKDAYS_MON,
} from "../../utils/date";

interface CalendarProps {
  /** Any date inside the displayed month. */
  month: Date;
  onMonthChange: (month: Date) => void;
  selectedStart: Date | null;
  selectedEnd?: Date | null;
  /** Preview endpoint while the user is choosing the second date. */
  hoverDate?: Date | null;
  onHoverDate?: (date: Date | null) => void;
  onSelectDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Focus returns to the chosen day after mount/selection. */
  autoFocus?: boolean;
}

/**
 * Month grid with full keyboard support (WAI-ARIA date picker pattern):
 * arrows move by day/week, PageUp/PageDown by month, Home/End to week edges.
 */
export function Calendar({
  month,
  onMonthChange,
  selectedStart,
  selectedEnd = null,
  hoverDate = null,
  onHoverDate,
  onSelectDate,
  minDate,
  maxDate,
  autoFocus = false,
}: CalendarProps) {
  const days = getCalendarCells(month);
  const [focused, setFocused] = useState<Date>(
    selectedStart ?? selectedEnd ?? startOfDay(new Date())
  );
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedStart) setFocused(selectedStart);
  }, [selectedStart]);

  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-day="cal-day-${toISODate(focused)}"]`)
        ?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // Focus only on mount: later moves go through focusDay().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const focusDay = useCallback((date: Date) => {
    setFocused(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      onMonthChange(startOfMonth(date));
    }
    requestAnimationFrame(() => {
      const id = `cal-day-${toISODate(date)}`;
      gridRef.current?.querySelector<HTMLElement>(`[data-day="${id}"]`)?.focus();
    });
  }, [month, onMonthChange]);

  const move = (date: Date, deltaDays: number) => {
    const next = addDays(date, deltaDays);
    if (minDate && next < startOfDay(minDate)) return;
    if (maxDate && next > startOfDay(maxDate)) return;
    focusDay(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        move(focused, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        move(focused, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(focused, -7);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(focused, 7);
        break;
      case "Home":
        event.preventDefault();
        move(focused, -((focused.getDay() + 6) % 7));
        break;
      case "End":
        event.preventDefault();
        move(focused, 6 - ((focused.getDay() + 6) % 7));
        break;
      case "PageUp":
        event.preventDefault();
        move(focused, -28);
        break;
      case "PageDown":
        event.preventDefault();
        move(focused, 28);
        break;
      default:
        break;
    }
  };

  const rangeEnd = selectedEnd ?? hoverDate;
  const inPreviewRange =
    selectedStart && rangeEnd && !isSameDay(selectedStart, rangeEnd)
      ? [selectedStart, rangeEnd].sort((a, b) => a.getTime() - b.getTime())
      : null;
  const today = startOfDay(new Date());

  return (
    <div className="w-[17.5rem] select-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
          aria-label="上个月"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p className="text-body font-semibold text-ink" aria-live="polite">
          {formatMonth(month)}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
          aria-label="下个月"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-line pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
        {WEEKDAYS_MON.map((label) => (
          <span key={label} className="py-1" aria-hidden="true">
            {label}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={formatMonth(month)}
        className="mt-1 grid grid-cols-7 gap-y-0.5"
        onKeyDown={onKeyDown}
        onMouseLeave={() => onHoverDate?.(null)}
      >
        {days.map((day) => {
          const iso = toISODate(day);
          const inMonth = day.getMonth() === month.getMonth();
          const isStart = isSameDay(day, selectedStart);
          const isEnd = isSameDay(day, selectedEnd);
          const isSelected = isStart || isEnd;
          const inRange = inPreviewRange ? isBetween(day, inPreviewRange[0], inPreviewRange[1]) : false;
          const rangePosition =
            inRange && !isSelected
              ? "bg-accent-soft text-accent hover:bg-accent/15"
              : "";
          const rounded =
            isStart && inPreviewRange
              ? "rounded-l-md"
              : isEnd && inPreviewRange
                ? "rounded-r-md"
                : "rounded-md";

          const disabled =
            (minDate && day < startOfDay(minDate)) || (maxDate && day > startOfDay(maxDate));
          const isFocused = isSameDay(day, focused);

          return (
            <div key={iso} role="gridcell" className="flex justify-center p-px">
              <button
                type="button"
                data-day={`cal-day-${iso}`}
                tabIndex={isFocused ? 0 : -1}
                disabled={disabled}
                aria-label={new Intl.DateTimeFormat("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                }).format(day)}
                aria-selected={isSelected}
                aria-current={isSameDay(day, today) ? "date" : undefined}
                onClick={() => onSelectDate(day)}
                onMouseEnter={() => onHoverDate?.(day)}
                onFocus={() => setFocused(day)}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center text-body tabular transition-colors",
                  "focus-visible:z-10",
                  rounded,
                  !inMonth && !isSelected && "text-ink-subtle/55",
                  inMonth && !isSelected && !inRange && "text-ink-muted hover:bg-surface-inset hover:text-ink",
                  rangePosition,
                  isSelected && "bg-primary font-semibold text-white hover:bg-primary-hover",
                  isSameDay(day, today) && !isSelected && "ring-1 ring-inset ring-accent/45",
                  disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
                )}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 border-t border-line px-1 pt-2 text-[10px] text-ink-subtle">
        ← → 切换日期 · PgUp/PgDn 切换月份 · Enter 选择
      </p>
    </div>
  );
}
