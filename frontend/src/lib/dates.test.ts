import { describe, expect, it } from "vitest";

import { formatMonthYear, weekdayLabels } from "@/lib/dates";

describe("calendar labels", () => {
  it("uses English month names in the DateInput popup", () => {
    expect(formatMonthYear(2026, 0)).toBe("January 2026");
    expect(formatMonthYear(2026, 6)).toBe("July 2026");
    expect(formatMonthYear(2026, 11)).toBe("December 2026");
  });

  it("uses English weekday abbreviations", () => {
    expect(weekdayLabels()).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });
});
