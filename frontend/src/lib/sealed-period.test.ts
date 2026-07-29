import { describe, expect, it } from "vitest";

import { bannerState, hasMeaningfulDrift } from "@/lib/sealed-period";
import type { SealedPeriodInfo } from "@/lib/report-types";

function sealed(overrides: Partial<SealedPeriodInfo> = {}): SealedPeriodInfo {
  return {
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    closed_at: "2026-07-02T09:00:00Z",
    drifted: false,
    drift_kurus: null,
    ...overrides,
  };
}

describe("bannerState", () => {
  it("says nothing for an ordinary open month", () => {
    expect(
      bannerState({ source: "live", sealed: null, view: "as_closed" }),
    ).toEqual({ kind: "none" });
  });

  it("announces a sealed month that hasn't moved", () => {
    expect(
      bannerState({ source: "as_closed", sealed: sealed(), view: "as_closed" }),
    ).toEqual({ kind: "sealed", closedOn: "2026-07-02" });
  });

  it("flags a sealed month the books have since moved away from", () => {
    const state = bannerState({
      source: "as_closed",
      sealed: sealed({ drifted: true, drift_kurus: -100_000 }),
      view: "as_closed",
    });
    expect(state).toEqual({
      kind: "drifted",
      closedOn: "2026-07-02",
      driftKurus: -100_000,
    });
  });

  it("offers the way back when deliberately viewing live", () => {
    expect(
      bannerState({ source: "live", sealed: null, view: "live" }),
    ).toEqual({ kind: "viewing_live" });
  });
});

describe("hasMeaningfulDrift", () => {
  it("is true only when there's a non-zero number to show", () => {
    const base = { kind: "drifted" as const, closedOn: "2026-07-02" };
    expect(hasMeaningfulDrift({ ...base, driftKurus: -100_000 })).toBe(true);
    // Offsetting changes can net to zero — "differs by 0,00 ₺" reads as a bug.
    expect(hasMeaningfulDrift({ ...base, driftKurus: 0 })).toBe(false);
    expect(hasMeaningfulDrift({ ...base, driftKurus: null })).toBe(false);
    expect(hasMeaningfulDrift({ kind: "sealed", closedOn: "x" })).toBe(false);
  });
});
