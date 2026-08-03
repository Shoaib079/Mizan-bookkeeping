import { describe, expect, it } from "vitest";

import {
  currentMonthRange,
  isoToday,
  resolveReportRange,
} from "@/lib/date-range";

describe("date-range", () => {
  const aug3 = new Date(2026, 7, 3, 15, 30, 0);

  it("isoToday uses local calendar date", () => {
    expect(isoToday(aug3)).toBe("2026-08-03");
  });

  it("currentMonthRange ends on today, not month end", () => {
    expect(currentMonthRange(aug3)).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
    });
  });

  it("resolveReportRange clamps future to dates", () => {
    expect(
      resolveReportRange("2026-08-01", "2026-08-31", currentMonthRange(aug3)),
    ).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
    });
  });

  it("resolveReportRange resets when from is after to", () => {
    expect(
      resolveReportRange("2026-08-10", "2026-08-03", currentMonthRange(aug3)),
    ).toEqual(currentMonthRange(aug3));
  });
});
