import { describe, expect, it } from "vitest";

import {
  closableMonths,
  closeState,
  failedChecks,
  monthLabel,
  monthValue,
  parseMonthValue,
  readinessSummary,
} from "@/lib/month-close";
import type {
  MonthCloseReadinessRead,
  PeriodLockRead,
  ReadinessCheck,
} from "@/lib/report-types";

function check(overrides: Partial<ReadinessCheck> = {}): ReadinessCheck {
  return {
    key: "k",
    label: "Some check",
    severity: "warn",
    passed: true,
    detail: "",
    count: 0,
    amount_kurus: null,
    href: null,
    ...overrides,
  };
}

function readiness(
  overrides: Partial<MonthCloseReadinessRead> = {},
): MonthCloseReadinessRead {
  return {
    year: 2026,
    month: 6,
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    checks: [],
    can_close: true,
    warning_count: 0,
    existing_lock: null,
    ...overrides,
  };
}

function lock(overrides: Partial<PeriodLockRead> = {}): PeriodLockRead {
  return {
    id: "lock-1",
    entity_id: "ent-1",
    lock_kind: "month",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    closed_at: "2026-07-02T09:00:00Z",
    closed_by: "user-1",
    reopened_at: null,
    reopened_by: null,
    dirty: false,
    ...overrides,
  };
}

describe("closableMonths", () => {
  it("starts at the month before the one we're in", () => {
    // Closing the month you're still trading in would lock the books against
    // today's own sales.
    const months = closableMonths(new Date(2026, 6, 27), 3); // July 2026
    expect(months.map((m) => m.value)).toEqual(["2026-06", "2026-05", "2026-04"]);
  });

  it("rolls back across a year boundary", () => {
    const months = closableMonths(new Date(2026, 0, 9), 2); // January 2026
    expect(months.map((m) => m.value)).toEqual(["2025-12", "2025-11"]);
  });

  it("never offers the current month", () => {
    const months = closableMonths(new Date(2026, 6, 1), 12);
    expect(months.map((m) => m.value)).not.toContain("2026-07");
  });
});

describe("month value round trip", () => {
  it("pads single-digit months", () => {
    expect(monthValue(2026, 3)).toBe("2026-03");
  });

  it("parses back", () => {
    expect(parseMonthValue("2026-03")).toEqual({ year: 2026, month: 3 });
  });

  it("rejects nonsense", () => {
    expect(parseMonthValue("2026-13")).toBeNull();
    expect(parseMonthValue("June")).toBeNull();
    expect(parseMonthValue("")).toBeNull();
  });

  it("labels in Turkish", () => {
    expect(monthLabel(2026, 6)).toBe("Haziran 2026");
    expect(monthLabel(2026, 12)).toBe("Aralık 2026");
  });
});

describe("closeState", () => {
  it("is open when there's no lock", () => {
    expect(closeState(readiness())).toEqual({ kind: "open", canClose: true });
  });

  it("is closed when a lock is active", () => {
    const state = closeState(readiness({ existing_lock: lock() }));
    expect(state.kind).toBe("closed");
  });

  it("treats a reopened lock as open again", () => {
    const state = closeState(
      readiness({ existing_lock: lock({ reopened_at: "2026-07-10T09:00:00Z" }) }),
    );
    expect(state).toEqual({ kind: "open", canClose: true });
  });

  it("carries the dirty flag through", () => {
    const state = closeState(readiness({ existing_lock: lock({ dirty: true }) }));
    expect(state.kind === "closed" && state.dirty).toBe(true);
  });
});

describe("readinessSummary", () => {
  it("leads with the blocker's own words when blocked", () => {
    const summary = readinessSummary(
      readiness({
        can_close: false,
        checks: [
          check({
            severity: "block",
            passed: false,
            detail: "3 imported lines still unclassified",
          }),
        ],
      }),
    );
    expect(summary).toBe("3 imported lines still unclassified");
  });

  it("counts warnings when closeable but imperfect", () => {
    expect(readinessSummary(readiness({ warning_count: 2 }))).toMatch(/2 things/);
  });

  it("says so plainly when everything passes", () => {
    expect(readinessSummary(readiness())).toMatch(/Ready to close/);
  });

  it("warns that a dirty closed month may no longer match what was exported", () => {
    const summary = readinessSummary(
      readiness({ existing_lock: lock({ dirty: true }) }),
    );
    expect(summary).toMatch(/changed since/i);
    expect(summary).toMatch(/exported/i);
  });

  it("explains the soft lock once closed and clean", () => {
    const summary = readinessSummary(readiness({ existing_lock: lock() }));
    expect(summary).toMatch(/need a reason/i);
  });
});

describe("failedChecks", () => {
  it("keeps only what didn't pass", () => {
    const result = failedChecks(
      readiness({
        checks: [
          check({ key: "a", passed: true }),
          check({ key: "b", passed: false }),
        ],
      }),
    );
    expect(result.map((c) => c.key)).toEqual(["b"]);
  });
});
