import { describe, expect, it } from "vitest";

import {
  bounceFeeCandidates,
  bounceLineNeedsAutoVoid,
  bounceOutflowCandidates,
  bounceReturnCandidates,
  buildBounceNetFee,
  formatBounceNetFeeLabel,
  formatBounceOutflowLabel,
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

  it("finds outflow candidates matching return amount", () => {
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const match = line({ id: "o", amount_kurus: -5_000_000 });
    const other = line({ id: "x", amount_kurus: -1_000_000 });
    expect(bounceOutflowCandidates([ret, match, other], ret).map((l) => l.id)).toEqual([
      "o",
    ]);
  });

  it("includes both fee charges and refunds as fee candidates", () => {
    const outflow = line({ id: "o", amount_kurus: -5_000_000 });
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const fee = line({ id: "f", amount_kurus: -1_676 });
    const refund = line({ id: "rf", amount_kurus: 1_526 });
    expect(
      bounceFeeCandidates([outflow, ret, fee, refund], "o", "r").map((l) => l.id).sort(),
    ).toEqual(["f", "rf"]);
  });

  it("nets fee charges and refunds to zero", () => {
    const candidates = [
      line({ id: "f", amount_kurus: -1_676, description: "Fee charged" }),
      line({ id: "r1", amount_kurus: 1_526, description: "Refund 1" }),
      line({ id: "r2", amount_kurus: 74, description: "Refund 2" }),
      line({ id: "r3", amount_kurus: 76, description: "Refund 3" }),
    ];
    const netFee = buildBounceNetFee(candidates);
    expect(netFee?.netKurus).toBe(0);
    expect(formatBounceNetFeeLabel(netFee!)).toBe("Net fee: 0,00 ₺ · No net fee");
    expect(netFee?.lineIds).toEqual(["f", "r1", "r2", "r3"]);
  });

  it("lists fee outflows excluding outflow and return", () => {
    const outflow = line({ id: "o", amount_kurus: -5_000_000 });
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const fee = line({ id: "f", amount_kurus: -250_00 });
    expect(bounceFeeCandidates([outflow, ret, fee], "o", "r").map((l) => l.id)).toEqual([
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
  it("finds outflow candidates including posted lines", () => {
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const imported = line({ id: "o1", amount_kurus: -5_000_000 });
    const posted = line({ id: "o2", amount_kurus: -5_000_000, status: "posted" });
    const other = line({ id: "x", amount_kurus: -1_000_000 });
    expect(bounceOutflowCandidates([ret, imported, posted, other], ret).map((l) => l.id).sort()).toEqual([
      "o1",
      "o2",
    ]);
  });

  it("detects lines that need auto-void", () => {
    expect(bounceLineNeedsAutoVoid(line({ id: "a", amount_kurus: -1, status: "posted" }))).toBe(
      true,
    );
    expect(bounceLineNeedsAutoVoid(line({ id: "b", amount_kurus: -1, status: "imported" }))).toBe(
      false,
    );
  });

  it("labels outflow state in dropdown text", () => {
    const posted = line({ id: "o", amount_kurus: -5_000_000, status: "posted" });
    expect(formatBounceOutflowLabel(posted)).toContain("will auto-void");
  });

  it("posts snake_case payload fields", () => {
    const source = sourceDeclaring("recordPaymentBounce");
    expect(source).toContain("outflow_line_id");
    expect(source).toContain("return_line_id");
    expect(source).toContain("fee_line_ids");
    expect(source).toContain("auto_void_confirmed");
    expect(source).toContain("person_type");
  });
});
