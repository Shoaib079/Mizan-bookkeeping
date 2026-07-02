import { describe, expect, it } from "vitest";

import type { BankStatementLine } from "@/lib/banking-types";
import {
  canDiscardStatement,
  filterStatementLines,
  isQueueLine,
  isSkippedLine,
  queueLines,
  summarizeStatementLines,
} from "@/lib/statement-line-filters";

function line(
  overrides: Partial<BankStatementLine> & Pick<BankStatementLine, "id" | "status">,
): BankStatementLine {
  return {
    statement_id: "stmt-1",
    transaction_date: "2026-06-01",
    amount_kurus: -500,
    description: "BSM commission",
    reference: null,
    classification: "unclassified",
    supplier_id: null,
    review_reason: null,
    journal_entry_id: null,
    ...overrides,
  };
}

describe("statement-line-filters", () => {
  it("treats imported and needs_review as queue lines", () => {
    expect(isQueueLine(line({ id: "a", status: "imported" }))).toBe(true);
    expect(isQueueLine(line({ id: "b", status: "needs_review" }))).toBe(true);
    expect(isQueueLine(line({ id: "c", status: "posted" }))).toBe(false);
  });

  it("detects skipped unknown lines without ledger", () => {
    const skipped = line({
      id: "s",
      status: "classified",
      classification: "unknown",
    });
    expect(isSkippedLine(skipped)).toBe(true);
    expect(
      filterStatementLines([skipped], "skipped", "").map((row) => row.id),
    ).toEqual(["s"]);
  });

  it("summarizes ledger vs no-ledger counts", () => {
    const lines = [
      line({ id: "1", status: "imported" }),
      line({
        id: "2",
        status: "posted",
        journal_entry_id: "je-1",
        classification: "bank_fee",
      }),
      line({
        id: "3",
        status: "classified",
        classification: "unknown",
      }),
    ];
    expect(queueLines(lines).map((row) => row.id)).toEqual(["1"]);
    expect(summarizeStatementLines(lines)).toMatchObject({
      total: 3,
      queue: 1,
      posted: 1,
      skipped: 1,
      withLedger: 1,
      noLedger: 2,
    });
  });

  it("filters outflows and search text", () => {
    const lines = [
      line({ id: "out", status: "imported", amount_kurus: -100 }),
      line({
        id: "in",
        status: "imported",
        amount_kurus: 5000,
        description: "TRENDYOL payment",
      }),
    ];
    expect(
      filterStatementLines(lines, "outflow", "").map((row) => row.id),
    ).toEqual(["out"]);
    expect(
      filterStatementLines(lines, "all", "trendyol").map((row) => row.id),
    ).toEqual(["in"]);
  });

  it("allows discard when no ledger-linked lines", () => {
    const lines = [
      line({ id: "1", status: "imported" }),
      line({
        id: "2",
        status: "classified",
        classification: "unknown",
      }),
    ];
    expect(canDiscardStatement(lines)).toBe(true);
  });

  it("blocks discard when any line is posted or linked", () => {
    expect(
      canDiscardStatement([
        line({ id: "1", status: "imported" }),
        line({ id: "2", status: "posted", journal_entry_id: "je-1" }),
      ]),
    ).toBe(false);
    expect(canDiscardStatement([line({ id: "1", status: "linked" })])).toBe(
      false,
    );
  });
});
