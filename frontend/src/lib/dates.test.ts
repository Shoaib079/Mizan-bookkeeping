import { describe, expect, it } from "vitest";

import { formatMonthYear, priorCalendarMonth, weekdayLabels } from "@/lib/dates";

describe("calendar labels", () => {
  it("uses English month names in the DateInput popup", () => {
    expect(formatMonthYear(2026, 0)).toBe("January 2026");
    expect(formatMonthYear(2026, 6)).toBe("July 2026");
    expect(formatMonthYear(2026, 11)).toBe("December 2026");
  });

  it("uses English weekday abbreviations", () => {
    expect(weekdayLabels()).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("returns the prior calendar month for salary period defaults", () => {
    expect(priorCalendarMonth(new Date(2026, 6, 6))).toEqual({
      year: 2026,
      month: 6,
    });
    expect(priorCalendarMonth(new Date(2026, 0, 15))).toEqual({
      year: 2025,
      month: 12,
    });
  });
});
