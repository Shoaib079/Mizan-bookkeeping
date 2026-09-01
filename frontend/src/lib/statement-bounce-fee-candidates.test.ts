import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import {
  formatBounceFeeLineLabel,
  isBankFeeRefundDescription,
  isBounceFeeCandidateLine,
} from "@/lib/statement-bounce-fee-candidates";

function line(
  overrides: Partial<BankStatementLine> & Pick<BankStatementLine, "id" | "amount_kurus">,
): BankStatementLine {
  return {
    statement_id: "s1",
    transaction_date: "2026-02-01",
    description: "test",
    reference: null,
    classification: "unclassified",
    status: "imported",
    supplier_id: null,
    review_reason: null,
    journal_entry_id: null,
    ...overrides,
  };
}

describe("statement bounce fee candidates", () => {
  it("detects fee refunds in Turkish", () => {
    expect(isBankFeeRefundDescription("Fast ücret iadesi")).toBe(true);
  });

  it("includes refunds and small fee charges", () => {
    const candidates = [
      line({ id: "r", amount_kurus: 1_526, description: "Fast ücret iadesi" }),
      line({ id: "f", amount_kurus: -1_676, description: "ÜCRET" }),
      line({ id: "b", amount_kurus: -399, description: "BSMV" }),
    ];
    expect(candidates.every((row) => isBounceFeeCandidateLine(row))).toBe(true);
  });

  it("excludes POS settlements and large payments", () => {
    expect(
      isBounceFeeCandidateLine(
        line({
          id: "p",
          amount_kurus: 10_440_670,
          description: "NET SATIŞ TUTARI",
        }),
      ),
    ).toBe(false);
    expect(
      isBounceFeeCandidateLine(
        line({ id: "s", amount_kurus: -550_000, description: "ÜCRET ODEME" }),
      ),
    ).toBe(false);
  });

  it("labels fee refunds in dropdown text", () => {
    expect(
      formatBounceFeeLineLabel(
        line({ id: "r", amount_kurus: 1_526, description: "Fast ücret iadesi" }),
      ),
    ).toContain("Fee refund");
  });
});
