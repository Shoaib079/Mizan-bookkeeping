/**
 * Guard: Reports write paths must send a stable Idempotency-Key.
 *
 * Regression for bank reconciliation closing-balance (and month/year close)
 * failing with "Idempotency-Key header required" when the UI omitted the key.
 * CURSOR_RULES §1 rule 15 — permanent automated test so the gap cannot return.
 */

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";


describe("Reports mutations send Idempotency-Key", () => {
  it("bank reconciliation closing-balance PATCH uses useSubmitIdempotency", async () => {
    const src = sourceDeclaring("BankReconciliationPage");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("closing-balance");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });

  it("month close and reopen POSTs use useSubmitIdempotency", async () => {
    const src = sourceDeclaring("MonthClosePage");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("period-locks/close");
    expect(src).toMatch(/period-locks\/\$\{lockId\}\/reopen/);
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });

  it("year-end close POST uses useSubmitIdempotency", async () => {
    const src = sourceDeclaring("YearEndClose");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("period-locks/year-end");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });
});
