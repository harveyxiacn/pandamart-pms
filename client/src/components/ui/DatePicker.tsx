import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, X } from "lucide-react";
import { cn } from "../../utils/classnames";
import { Popover } from "./Popover";
import { Calendar } from "./Calendar";
import {
  RANGE_PRESETS,
  formatISO,
  formatRange,
  isSameDay,
  parseISODate,
  resolvePreset,
  startOfMonth,
  toISODate,
  type DateRange,
  type RangePresetKey,
} from "../../utils/date";

const triggerClass =
  "inline-flex h-9 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm " +
  "text-ink transition-colors hover:border-ink-subtle/70 focus-visible:border-accent " +
  "disabled:cursor-not-allowed disabled:bg-surface-inset disabled:text-ink-subtle";

/* ── single date ───────────────────────────────────────────── */

interface DatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Accessible name when the control is not wrapped in a visible label. */
  label?: string;
  clearable?: boolean;
  className?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "选择日期",
  label = "选择日期",
  clearable = false,
  className,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const selected = parseISODate(value);
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    if (open) setMonth(startOfMonth(parseISODate(value) ?? new Date()));
  }, [open, value]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          id={id}
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          className={cn(triggerClass, clearable && value && "pr-9")}
        >
          <CalendarDays size={15} className="shrink-0 text-ink-subtle" aria-hidden="true" />
          <span className={cn("flex-1 truncate", !value && "text-ink-subtle")}>
            {value ? formatISO(value) : placeholder}
          </span>
          {!clearable || !value ? (
            <ChevronDown size={14} className="shrink-0 text-ink-subtle" aria-hidden="true" />
          ) : null}
        </button>
        {clearable && value ? (
          <button
            type="button"
            aria-label="清除日期"
            onClick={() => onChange(null)}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Popover open={open} onClose={close} anchorRef={anchorRef} ariaLabel="选择日期" className="p-3">
        <Calendar
          month={month}
          onMonthChange={setMonth}
          selectedStart={selected}
          autoFocus
          onSelectDate={(date) => {
            onChange(toISODate(date));
            close();
          }}
        />
      </Popover>
    </>
  );
}

/* ── date range ────────────────────────────────────────────── */

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  label?: string;
  clearable?: boolean;
  className?: string;
  showPresets?: boolean;
  id?: string;
}

/** Two-click range selection with quick presets; applies as soon as both ends exist. */
export function DateRangePicker({
  value,
  onChange,
  placeholder = "选择日期范围",
  label = "选择日期范围",
  clearable = true,
  className,
  showPresets = true,
  id,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(parseISODate(value.start) ?? new Date()));

  useEffect(() => {
    if (!open) return;
    const start = parseISODate(value.start);
    const end = parseISODate(value.end);
    setDraftStart(start);
    setDraftEnd(end);
    setHoverDate(null);
    setMonth(startOfMonth(start ?? end ?? new Date()));
  }, [open, value.start, value.end]);

  const close = useCallback(() => setOpen(false), []);

  const commit = useCallback(
    (start: Date | null, end: Date | null) => {
      onChange({ start: start ? toISODate(start) : null, end: end ? toISODate(end) : null });
    },
    [onChange]
  );

  const pick = (date: Date) => {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    const [start, end] = date < draftStart ? [date, draftStart] : [draftStart, date];
    setDraftStart(start);
    setDraftEnd(end);
    commit(start, end);
    close();
  };

  const applyPreset = (key: RangePresetKey) => {
    const range = resolvePreset(key);
    const start = parseISODate(range.start);
    const end = parseISODate(range.end);
    setDraftStart(start);
    setDraftEnd(end);
    commit(start, end);
    close();
  };

  const summary = useMemo(() => {
    if (!value.start && !value.end) return placeholder;
    return formatRange(value.start, value.end);
  }, [value.start, value.end, placeholder]);

  const activePreset = useMemo(() => {
    if (!value.start || !value.end) return null;
    for (const preset of RANGE_PRESETS) {
      const resolved = resolvePreset(preset.key);
      if (resolved.start === value.start && resolved.end === value.end) return preset.key;
    }
    return null;
  }, [value.start, value.end]);

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          id={id}
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          className={cn(triggerClass, "pr-9")}
        >
          <CalendarDays size={15} className="shrink-0 text-ink-subtle" aria-hidden="true" />
          <span className={cn("flex-1 truncate tabular", !value.start && "text-ink-subtle")}>
            {summary}
          </span>
        </button>
        {clearable && (value.start || value.end) ? (
          <button
            type="button"
            aria-label="清除日期范围"
            onClick={() => {
              commit(null, null);
              setDraftStart(null);
              setDraftEnd(null);
            }}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        )}
      </div>

      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        ariaLabel="选择日期范围"
        className="p-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          {showPresets ? (
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-line pb-2 sm:w-28 sm:flex-col sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
              <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle sm:block">
                快捷选择
              </p>
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-body transition-colors sm:w-full",
                    activePreset === preset.key
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-muted hover:bg-surface-inset hover:text-ink"
                  )}
                >
                  {preset.label}
                  {activePreset === preset.key ? <Check size={13} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <Calendar
              month={month}
              onMonthChange={setMonth}
              selectedStart={draftStart}
              selectedEnd={draftEnd}
              hoverDate={hoverDate}
              onHoverDate={setHoverDate}
              autoFocus
              onSelectDate={pick}
            />
            {draftStart && !draftEnd ? (
              <p className="mt-1 text-center text-[11px] text-accent">再选择一个结束日期</p>
            ) : null}
          </div>
        </div>
      </Popover>
    </>
  );
}

/** True when both ends exist and are in order — handy for API params. */
export function isCompleteRange(range: DateRange): boolean {
  return Boolean(range.start && range.end) && String(range.start) <= String(range.end);
}

/** True when the two endpoints are the same local day. */
export function isSingleDay(range: DateRange): boolean {
  const start = parseISODate(range.start);
  const end = parseISODate(range.end);
  return Boolean(start && end && isSameDay(start, end));
}
