import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import {
  amountDirectionForLines,
  bulkModeForLines,
  validateBulkSelection,
} from "@/lib/statement-bulk-selection";

function line(
  partial: Partial<BankStatementLine> & Pick<BankStatementLine, "id" | "amount_kurus" | "status">,
): BankStatementLine {
  return {
    statement_id: "stmt-1",
    transaction_date: "2026-06-01",
    description: "Test",
    reference: null,
    classification: "unclassified",
    supplier_id: null,
    review_reason: null,
    journal_entry_id: null,
    ...partial,
  };
}

describe("bulkModeForLines", () => {
  it("returns post when all lines are queue", () => {
    expect(
      bulkModeForLines([
        line({ id: "a", amount_kurus: -100, status: "imported" }),
        line({ id: "b", amount_kurus: -200, status: "needs_review" }),
      ]),
    ).toBe("post");
  });

  it("returns correct when all lines are posted", () => {
    expect(
      bulkModeForLines([
        line({ id: "a", amount_kurus: -100, status: "posted", journal_entry_id: "je-1" }),
        line({ id: "b", amount_kurus: -50, status: "linked", journal_entry_id: "je-2" }),
      ]),
    ).toBe("correct");
  });

  it("returns null for mixed queue and posted", () => {
    expect(
      bulkModeForLines([
        line({ id: "a", amount_kurus: -100, status: "imported" }),
        line({ id: "b", amount_kurus: -50, status: "posted", journal_entry_id: "je-1" }),
      ]),
    ).toBeNull();
  });
});

describe("amountDirectionForLines", () => {
  it("detects mixed directions", () => {
    expect(
      amountDirectionForLines([
        line({ id: "a", amount_kurus: 100, status: "imported" }),
        line({ id: "b", amount_kurus: -50, status: "imported" }),
      ]),
    ).toBe("mixed");
  });
});

describe("validateBulkSelection", () => {
  it("rejects staff payment in bulk", () => {
    const result = validateBulkSelection(
      [line({ id: "a", amount_kurus: -100_00, status: "imported" })],
      "staff_payment",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue).toBe("unsupported_classification");
    }
  });

  it("accepts bank fee outflows", () => {
    const result = validateBulkSelection(
      [
        line({ id: "a", amount_kurus: -100, status: "imported" }),
        line({ id: "b", amount_kurus: -200, status: "imported" }),
      ],
      "bank_fee",
    );
    expect(result.ok).toBe(true);
  });
});
