import { describe, expect, it } from "vitest";

import { closableYears, yearEndSummary } from "@/lib/month-close";
import { lateNightDateHint } from "@/lib/dates";
import type { YearEndPreviewRead } from "@/lib/report-types";

function preview(
  overrides: Partial<YearEndPreviewRead> = {},
): YearEndPreviewRead {
  return {
    year: 2026,
    closing_date: "2026-12-31",
    revenue_total_kurus: 500_000,
    expense_total_kurus: 200_000,
    net_result_kurus: 300_000,
    lines: [
      {
        account_id: "a",
        code: "4000",
        name: "Sales Revenue",
        account_type: "revenue",
        balance_kurus: 500_000,
      },
    ],
    already_closed: false,
    journal_entry_id: null,
    december_closed: true,
    can_close: true,
    ...overrides,
  };
}

describe("closableYears", () => {
  it("starts at last year — you can't close a year you're still trading in", () => {
    expect(closableYears(new Date(2026, 6, 27), 3)).toEqual([2025, 2024, 2023]);
  });
});

describe("yearEndSummary", () => {
  it("says there is nothing to close before nagging about December", () => {
    const text = yearEndSummary(
      preview({ december_closed: false, can_close: false, lines: [], net_result_kurus: 0 }),
    );
    expect(text).toMatch(/Nothing to close for 2026/);
    expect(text).not.toMatch(/Close December/);
  });

  it("sends you to close December first when there are balances", () => {
    const text = yearEndSummary(preview({ december_closed: false, can_close: false }));
    expect(text).toMatch(/Close December 2026 first/);
  });

  it("says there's nothing to do for an empty year", () => {
    const text = yearEndSummary(
      preview({ lines: [], net_result_kurus: 0, december_closed: true }),
    );
    expect(text).toMatch(/Nothing to close/);
  });

  it("names Retained Earnings so the partner link is visible", () => {
    expect(yearEndSummary(preview())).toMatch(/Retained Earnings/);
  });

  it("words a loss as a loss", () => {
    const text = yearEndSummary(preview({ net_result_kurus: -50_000 }));
    expect(text).toMatch(/loss/i);
    expect(text).toMatch(/reduce/i);
  });

  it("reports a closed year as done", () => {
    const text = yearEndSummary(preview({ already_closed: true }));
    expect(text).toMatch(/is closed/);
    expect(text).toMatch(/start from zero/);
  });
});

describe("lateNightDateHint", () => {
  const oneAm = new Date(2026, 6, 29, 1, 30);
  const midday = new Date(2026, 6, 29, 12, 0);

  it("warns when a form sits on today's date in the small hours", () => {
    const hint = lateNightDateHint("29.07.2026", oneAm);
    expect(hint).toMatch(/after midnight/);
    expect(hint).toContain("29.07.2026");
    // Points at the night that just ended.
    expect(hint).toContain("28.07.2026");
  });

  it("says nothing during normal trading hours", () => {
    expect(lateNightDateHint("29.07.2026", midday)).toBeNull();
  });

  it("says nothing once a different date is chosen", () => {
    // The user already picked last night — no need to nag.
    expect(lateNightDateHint("28.07.2026", oneAm)).toBeNull();
  });

  it("says nothing for an empty or half-typed date", () => {
    expect(lateNightDateHint("", oneAm)).toBeNull();
    expect(lateNightDateHint("29.07", oneAm)).toBeNull();
  });
});
