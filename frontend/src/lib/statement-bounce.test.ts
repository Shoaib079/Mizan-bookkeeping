import { describe, expect, it } from "vitest";

import {
  bounceFeeCandidates,
  bounceReturnCandidates,
} from "@/lib/statement-bounce";
import type { BankStatementLine } from "@/lib/banking-types";
import { STATEMENT_CLASSIFICATION_OPTIONS } from "@/lib/statement-classification-catalog";
import { classificationLabel } from "@/lib/statement-classification-options";
import { isBouncedLine } from "@/lib/statement-line-filters";
import { sourceDeclaring } from "@/test-support/source";

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

describe("statement bounce helpers", () => {
  it("finds return candidates matching outflow amount", () => {
    const outflow = line({ id: "o", amount_kurus: -5_000_000 });
    const match = line({ id: "r", amount_kurus: 5_000_000 });
    const other = line({ id: "x", amount_kurus: 1_000_000 });
    expect(bounceReturnCandidates([outflow, match, other], outflow).map((l) => l.id)).toEqual([
      "r",
    ]);
  });

  it("lists fee outflows excluding outflow and return", () => {
    const outflow = line({ id: "o", amount_kurus: -5_000_000 });
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const fee = line({ id: "f", amount_kurus: -250_00 });
    expect(bounceFeeCandidates([outflow, ret, fee], outflow, "r").map((l) => l.id)).toEqual([
      "f",
    ]);
  });

  it("labels payment_bounced without catalog entry", () => {
    expect(classificationLabel("payment_bounced")).toBe("Payment bounced");
    expect(
      STATEMENT_CLASSIFICATION_OPTIONS.some((opt) => opt.value === "payment_bounced"),
    ).toBe(false);
  });

  it("detects bounced lines", () => {
    expect(
      isBouncedLine(
        line({
          id: "b",
          amount_kurus: -100,
          classification: "payment_bounced",
          status: "classified",
          bounce_pair_id: "pair-1",
        }),
      ),
    ).toBe(true);
  });
});

describe("statement bounce dialog", () => {
  it("posts snake_case payload fields", () => {
    const source = sourceDeclaring("recordPaymentBounce");
    expect(source).toContain("outflow_line_id");
    expect(source).toContain("return_line_id");
    expect(source).toContain("person_type");
  });
});
