import { describe, expect, it } from "vitest";

import type { StatementLineReview } from "@/lib/banking-types";
import {
  countLinesByTab,
  filterLinesByDateRange,
  filterLinesByTab,
  matchesReviewTab,
  suggestMatchToken,
} from "@/lib/statement-review";

function line(
  overrides: Partial<StatementLineReview> & Pick<StatementLineReview, "id" | "status">,
): StatementLineReview {
  return {
    statement_id: "stmt-1",
    transaction_date: "2026-03-01",
    amount_kurus: -25000,
    description: "Payment to MIGROS TIC",
    reference: null,
    classification: "unclassified",
    supplier_id: null,
    review_reason: null,
    journal_entry_id: null,
    ...overrides,
  };
}

describe("matchesReviewTab", () => {
  it("maps needs_review tab to needs_review status", () => {
    expect(
      matchesReviewTab(line({ id: "1", status: "needs_review" }), "needs_review"),
    ).toBe(true);
    expect(
      matchesReviewTab(line({ id: "2", status: "posted" }), "needs_review"),
    ).toBe(false);
  });

  it("maps rule_auto tab to classification_source rule_auto", () => {
    expect(
      matchesReviewTab(
        line({ id: "1", status: "posted", classification_source: "rule_auto" }),
        "rule_auto",
      ),
    ).toBe(true);
    expect(
      matchesReviewTab(
        line({ id: "2", status: "posted", classification_source: "manual" }),
        "rule_auto",
      ),
    ).toBe(false);
  });

  it("maps posted tab to posted manual lines only", () => {
    expect(
      matchesReviewTab(
        line({ id: "1", status: "posted", classification_source: "manual" }),
        "posted",
      ),
    ).toBe(true);
    expect(
      matchesReviewTab(
        line({ id: "2", status: "posted", classification_source: "rule_auto" }),
        "posted",
      ),
    ).toBe(false);
  });

  it("maps linked tab to linked status", () => {
    expect(matchesReviewTab(line({ id: "1", status: "linked" }), "linked")).toBe(
      true,
    );
    expect(matchesReviewTab(line({ id: "2", status: "posted" }), "linked")).toBe(
      false,
    );
  });
});

describe("filterLinesByTab", () => {
  const lines = [
    line({ id: "1", status: "needs_review" }),
    line({ id: "2", status: "posted", classification_source: "rule_auto" }),
    line({ id: "3", status: "posted", classification_source: "manual" }),
    line({ id: "4", status: "linked" }),
  ];

  it("filters each tab independently", () => {
    expect(filterLinesByTab(lines, "needs_review").map((row) => row.id)).toEqual([
      "1",
    ]);
    expect(filterLinesByTab(lines, "rule_auto").map((row) => row.id)).toEqual(["2"]);
    expect(filterLinesByTab(lines, "posted").map((row) => row.id)).toEqual(["3"]);
    expect(filterLinesByTab(lines, "linked").map((row) => row.id)).toEqual(["4"]);
  });

  it("counts lines per tab", () => {
    expect(countLinesByTab(lines)).toEqual({
      needs_review: 1,
      rule_auto: 1,
      posted: 1,
      linked: 1,
    });
  });
});

describe("filterLinesByDateRange", () => {
  const lines = [
    line({ id: "1", status: "posted", transaction_date: "2026-03-01" }),
    line({ id: "2", status: "posted", transaction_date: "2026-03-15" }),
    line({ id: "3", status: "posted", transaction_date: "2026-04-01" }),
  ];

  it("keeps lines within inclusive ISO date bounds", () => {
    expect(
      filterLinesByDateRange(lines, "2026-03-01", "2026-03-31").map((row) => row.id),
    ).toEqual(["1", "2"]);
  });
});

describe("suggestMatchToken", () => {
  it("prefers uppercase counterparty token", () => {
    expect(suggestMatchToken("HAVALE MIGROS TIC AS ODEME")).toBe("HAVALE");
    expect(suggestMatchToken("Payment to Metro Gida")).toBe("Payment");
  });
});
