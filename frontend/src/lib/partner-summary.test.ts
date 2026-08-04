import { describe, expect, it } from "vitest";

import {
  partnerCashSummary,
  partnerProfitSummary,
  type PartnerSummaryRow,
} from "@/lib/partner-summary";

function row(
  movement_type: string,
  amount_kurus: number,
  extra: Partial<PartnerSummaryRow> = {},
): PartnerSummaryRow {
  return {
    movement_type,
    amount_kurus,
    display_kind: "effective",
    journal_entry_id: "je-1",
    ...extra,
  };
}

describe("partnerProfitSummary", () => {
  it("splits a netted allocation into earned, used, and left", () => {
    // 101.700 share: 100.000 cleared an open drawing, 1.700 stayed as capital.
    const rows = [
      row("profit_settlement", 10_000_000),
      row("profit_allocation", 170_000),
    ];
    const summary = partnerProfitSummary(rows, 170_000);

    expect(summary.allocatedKurus).toBe(10_170_000);
    expect(summary.usedForDrawingsKurus).toBe(10_000_000);
    expect(summary.paidOutKurus).toBe(0);
    expect(summary.unpaidKurus).toBe(170_000);
    expect(summary.periodCount).toBe(1);
  });

  it("the sticker's lines reconcile: allocated − used − paid = unpaid", () => {
    const rows = [
      row("profit_settlement", 4_000_000, { journal_entry_id: "je-a" }),
      row("profit_allocation", 6_000_000, { journal_entry_id: "je-a" }),
      row("profit_paid", -1_500_000, { journal_entry_id: "je-b" }),
    ];
    const summary = partnerProfitSummary(rows, 4_500_000);

    expect(
      summary.allocatedKurus - summary.usedForDrawingsKurus - summary.paidOutKurus,
    ).toBe(summary.unpaidKurus);
  });

  it("counts one period per allocation event, not per row", () => {
    const rows = [
      row("profit_settlement", 1_000, { journal_entry_id: "je-june" }),
      row("profit_allocation", 2_000, { journal_entry_id: "je-june" }),
      row("profit_allocation", 3_000, { journal_entry_id: "je-july" }),
      row("profit_allocation", 4_000, { journal_entry_id: "je-august" }),
    ];
    expect(partnerProfitSummary(rows).periodCount).toBe(3);
  });

  it("ignores voided and superseded rows", () => {
    const rows = [
      row("profit_allocation", 500_000),
      row("profit_allocation", 999_999, { display_kind: "superseded" }),
      row("profit_allocation", 888_888, { display_kind: "void_reversal" }),
    ];
    expect(partnerProfitSummary(rows).allocatedKurus).toBe(500_000);
  });

  it("falls back to deriving unpaid when the API figure is absent", () => {
    const rows = [row("profit_allocation", 800_000), row("profit_paid", -300_000)];
    expect(partnerProfitSummary(rows).unpaidKurus).toBe(500_000);
  });

  it("reads zero for a partner with no profit history", () => {
    const summary = partnerProfitSummary([row("expense_fronted", 4_500)]);
    expect(summary.allocatedKurus).toBe(0);
    expect(summary.periodCount).toBe(0);
  });
});

describe("partnerCashSummary", () => {
  it("reports drawings taken as a positive figure", () => {
    const rows = [row("drawing", -10_000_000), row("drawing", -2_000_000)];
    expect(partnerCashSummary(rows).drawingsTakenKurus).toBe(12_000_000);
  });

  it("shows nothing outstanding once drawings are settled", () => {
    const rows = [row("drawing", -10_000_000), row("profit_settlement", 10_000_000)];
    const summary = partnerCashSummary(rows, { drawingsNetKurus: 0 });
    expect(summary.drawingsTakenKurus).toBe(10_000_000);
    expect(summary.drawingsOutstandingKurus).toBe(0);
  });

  it("shows the open amount while money is still out", () => {
    const summary = partnerCashSummary([row("drawing", -5_000_000)], {
      drawingsNetKurus: -5_000_000,
    });
    expect(summary.drawingsOutstandingKurus).toBe(5_000_000);
  });

  it("prefers API totals over row sums for capital and fronted expenses", () => {
    const summary = partnerCashSummary([row("capital_contribution", 1)], {
      capitalContributionKurus: 5_000_000,
      capitalBalanceKurus: 5_170_000,
      reimbursementBalanceKurus: 450_000,
    });
    expect(summary.capitalContributedKurus).toBe(5_000_000);
    expect(summary.capitalInBusinessKurus).toBe(5_170_000);
    expect(summary.expensesFrontedKurus).toBe(450_000);
  });
});
