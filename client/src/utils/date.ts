/*
  Local-date helpers. Everything here works in the browser's local timezone on
  purpose: the server stores DATE columns and the UI must never shift a day
  because of a UTC conversion (a bug we already paid for on invoice due dates).
*/

export const WEEKDAYS_MON = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBetween(value: Date, start: Date, end: Date): boolean {
  const t = startOfDay(value).getTime();
  return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime();
}

export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * Six weeks (42 cells) starting on Monday, covering the given month plus the
 * leading/trailing days needed to keep the grid rectangular.
 */
export function getCalendarCells(month: Date): Date[] {
  const first = startOfMonth(month);
  // getDay(): 0 = Sunday. Convert to a Monday-first offset.
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function formatISO(value: string | null | undefined): string {
  const date = parseISODate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatCompact(value: string | null | undefined): string {
  const date = parseISODate(value);
  if (!date) return "-";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return "选择日期范围";
  if (start && !end) return `${formatCompact(start)} 起`;
  if (start && end) {
    if (start === end) return formatCompact(start);
    const a = parseISODate(start);
    const b = parseISODate(end);
    if (a && b && a.getFullYear() === b.getFullYear()) {
      return `${formatCompact(start)} – ${formatCompact(end)}`;
    }
    return `${formatISO(start)} – ${formatISO(end)}`;
  }
  return "选择日期范围";
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

export type RangePresetKey =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear";

export interface RangePreset {
  key: RangePresetKey;
  label: string;
}

export const RANGE_PRESETS: RangePreset[] = [
  { key: "today", label: "今天" },
  { key: "last7", label: "近 7 天" },
  { key: "last30", label: "近 30 天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "thisYear", label: "今年" },
];

export function resolvePreset(key: RangePresetKey, now = new Date()): DateRange {
  const today = startOfDay(now);
  switch (key) {
    case "today":
      return { start: toISODate(today), end: toISODate(today) };
    case "last7":
      return { start: toISODate(addDays(today, -6)), end: toISODate(today) };
    case "last30":
      return { start: toISODate(addDays(today, -29)), end: toISODate(today) };
    case "thisMonth":
      return { start: toISODate(startOfMonth(today)), end: toISODate(today) };
    case "lastMonth": {
      const prev = addMonths(today, -1);
      return { start: toISODate(startOfMonth(prev)), end: toISODate(endOfMonth(prev)) };
    }
    case "thisYear":
      return { start: toISODate(new Date(today.getFullYear(), 0, 1)), end: toISODate(today) };
    default:
      return { start: null, end: null };
  }
}
