import { describe, expect, it } from "vitest";

import { priorPeriodFor, priorPeriodIsUsable } from "@/lib/prior-period";

describe("priorPeriodFor", () => {
  it("lets the backend decide on auto", () => {
    expect(priorPeriodFor("auto", "2026-08-01", "2026-08-04")).toBeNull();
  });

  it("previous takes the same number of days ending the day before", () => {
    expect(priorPeriodFor("previous", "2026-08-01", "2026-08-04")).toEqual({
      from: "2026-07-28",
      to: "2026-07-31",
    });
  });

  it("last month keeps the same dates", () => {
    expect(priorPeriodFor("last-month", "2026-08-01", "2026-08-04")).toEqual({
      from: "2026-07-01",
      to: "2026-07-04",
    });
  });

  it("last year keeps the same dates", () => {
    expect(priorPeriodFor("last-year", "2026-08-01", "2026-08-31")).toEqual({
      from: "2025-08-01",
      to: "2025-08-31",
    });
  });

  it("clamps to a short month instead of rolling into the next one", () => {
    // 31 March has no counterpart in February; naive date maths would land on
    // 3 March and compare the month against part of itself.
    expect(priorPeriodFor("last-month", "2026-03-01", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("keeps 29 February when the previous year had one", () => {
    expect(priorPeriodFor("last-year", "2025-02-01", "2025-02-28")).toEqual({
      from: "2024-02-01",
      to: "2024-02-28",
    });
  });

  it("flags a mode whose prior period would overlap the current one", () => {
    // "Same dates last month" against a whole year runs Dec 2025 – Nov 2026,
    // overlapping eleven months of the period it is compared against.
    expect(priorPeriodIsUsable("last-month", "2026-01-01", "2026-12-31")).toBe(
      false,
    );
    expect(priorPeriodIsUsable("last-year", "2026-01-01", "2026-12-31")).toBe(
      true,
    );
    expect(priorPeriodIsUsable("auto", "2026-01-01", "2026-12-31")).toBe(true);
  });

  it("never returns a prior period that overlaps the current one", () => {
    const ranges: [string, string][] = [
      ["2026-08-01", "2026-08-04"],
      ["2026-07-01", "2026-07-31"],
      ["2026-03-01", "2026-03-31"],
      ["2026-01-01", "2026-12-31"],
      ["2026-07-15", "2026-07-15"],
    ];
    for (const mode of ["previous", "last-month", "last-year"] as const) {
      for (const [from, to] of ranges) {
        if (!priorPeriodIsUsable(mode, from, to)) continue;
        const prior = priorPeriodFor(mode, from, to)!;
        expect(prior.from <= prior.to, `${mode} ${from}`).toBe(true);
        expect(prior.to < from, `${mode} ${from} overlaps`).toBe(true);
      }
    }
  });
});
