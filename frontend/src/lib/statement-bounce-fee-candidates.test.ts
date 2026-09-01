import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import {
  formatFeeCandidateRow,
  getBounceFeeCandidates,
  getFeeType,
  isBankFeeRefundDescription,
  isBounceFeeCandidateLine,
  isUnpostedBounceFeeLine,
  manualFeeClearsSelection,
  resolveBounceNetFeeKurus,
  sumFeeCandidateKurus,
  toggleFeeSelection,
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

  it("only includes unposted lines in getBounceFeeCandidates", () => {
    const outflow = line({ id: "o", amount_kurus: -5_000_000 });
    const ret = line({ id: "r", amount_kurus: 5_000_000 });
    const fee = line({ id: "f", amount_kurus: -399, description: "BSMV" });
    const posted = line({
      id: "p",
      amount_kurus: -250_00,
      description: "HAVALE ÜCRETİ",
      status: "posted",
    });
    const ids = getBounceFeeCandidates([outflow, ret, fee, posted], "o", "r").map((f) => f.id);
    expect(ids).toEqual(["f"]);
    expect(isUnpostedBounceFeeLine(posted)).toBe(false);
  });

  it("labels fee refunds in row text", () => {
    const candidate = getBounceFeeCandidates(
      [
        line({ id: "o", amount_kurus: -1 }),
        line({ id: "r", amount_kurus: 1 }),
        line({ id: "rf", amount_kurus: 1_526, description: "Fast ücret iadesi" }),
      ],
      "o",
      "r",
    )[0]!;
    expect(formatFeeCandidateRow(candidate)).toContain("Fee refund");
    expect(getFeeType(line({ id: "rf", amount_kurus: 1_526, description: "Fast ücret iadesi" }))).toBe(
      "refund",
    );
  });

  it("manual fee clears selections and vice versa", () => {
    expect(manualFeeClearsSelection(["a"])).toBe(true);
    expect(toggleFeeSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFeeSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("calculates net fee from manual or selected lines", () => {
    const fees = getBounceFeeCandidates(
      [
        line({ id: "o", amount_kurus: -5_000_000 }),
        line({ id: "r", amount_kurus: 5_000_000 }),
        line({ id: "f", amount_kurus: -1_676, description: "ÜCRET" }),
        line({ id: "rf", amount_kurus: 1_526, description: "Fast ücret iadesi" }),
      ],
      "o",
      "r",
    );
    expect(sumFeeCandidateKurus(fees)).toBe(-150);
    expect(resolveBounceNetFeeKurus(-200, fees)).toBe(-200);
    expect(resolveBounceNetFeeKurus(null, fees)).toBe(-150);
  });
});
