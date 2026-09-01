import { describe, expect, it } from "vitest";

import {
  calendarMonthContaining,
  currentMonthRange,
  isoToday,
  lastFullMonthRange,
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

  it("lastFullMonthRange is the whole prior calendar month", () => {
    expect(lastFullMonthRange(new Date(2026, 7, 24))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("calendarMonthContaining returns the full month for a date inside it", () => {
    expect(calendarMonthContaining("2026-08-15")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("resolveReportRange clamps future to dates", () => {
    expect(
      resolveReportRange(
        "2026-08-01",
        "2026-08-31",
        currentMonthRange(aug3),
        aug3,
      ),
    ).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
    });
  });

  it("resolveReportRange resets when from is after to", () => {
    expect(
      resolveReportRange(
        "2026-08-10",
        "2026-08-03",
        currentMonthRange(aug3),
        aug3,
      ),
    ).toEqual(currentMonthRange(aug3));
  });
});

describe("resolveReportRange with allowFuture", () => {
  const NOW = new Date(2026, 7, 9); // 9 Aug 2026
  const defaults = { from: "2026-08-01", to: "2026-08-09" };

  it("still clamps by default", () => {
    // A profit and loss "to" next month is a question with no answer.
    const { to } = resolveReportRange("2026-08-01", "2026-12-31", defaults, NOW);
    expect(to).toBe("2026-08-09");
  });

  it("lets the ledger reach a future-dated entry", () => {
    // A misread date put a real invoice at 16.09.2026. With the clamp, no
    // range could include it: typing a future end date snapped back to
    // today, so the entry could not be opened, corrected or voided from
    // anywhere in the app. Refusing to show it did not stop it existing.
    const { from, to } = resolveReportRange(
      "2026-08-01",
      "2026-12-31",
      defaults,
      NOW,
      { allowFuture: true },
    );
    expect(from).toBe("2026-08-01");
    expect(to).toBe("2026-12-31");
  });

  it("covers the invoice that caused this", () => {
    const { from, to } = resolveReportRange(
      "2026-07-01",
      "2026-09-30",
      defaults,
      NOW,
      { allowFuture: true },
    );
    expect(from <= "2026-09-16" && "2026-09-16" <= to).toBe(true);
  });

  it("still rejects a backwards range", () => {
    const { from, to } = resolveReportRange(
      "2026-12-31",
      "2026-01-01",
      defaults,
      NOW,
      { allowFuture: true },
    );
    expect(from <= to).toBe(true);
  });
});
