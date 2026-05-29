import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime } from "../formatters";

describe("formatters", () => {
  it("formats currency in USD", () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain("$");
    expect(result).toContain("1,234.50");
  });

  it("returns dash for empty values", () => {
    expect(formatCurrency(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("formats date and datetime", () => {
    expect(formatDate("2026-03-05")).toContain("2026");
    expect(formatDateTime("2026-03-05T09:30:00.000Z")).toContain("2026");
  });
});
