/**
 * Guard: Reports write paths must send a stable Idempotency-Key.
 *
 * Regression for bank reconciliation closing-balance (and month/year close)
 * failing with "Idempotency-Key header required" when the UI omitted the key.
 * CURSOR_RULES §1 rule 15 — permanent automated test so the gap cannot return.
 */

import { describe, expect, it } from "vitest";

async function readSource(relativePath: string) {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

describe("Reports mutations send Idempotency-Key", () => {
  it("bank reconciliation closing-balance PATCH uses useSubmitIdempotency", async () => {
    const src = await readSource("../app/reports/bank-reconciliation/page.tsx");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("closing-balance");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });

  it("month close and reopen POSTs use useSubmitIdempotency", async () => {
    const src = await readSource("../app/reports/month-close/page.tsx");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("period-locks/close");
    expect(src).toMatch(/period-locks\/\$\{lockId\}\/reopen/);
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });

  it("year-end close POST uses useSubmitIdempotency", async () => {
    const src = await readSource("../components/reports/year-end-close.tsx");
    expect(src).toContain("useSubmitIdempotency");
    expect(src).toContain("period-locks/year-end");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/beginSubmit\(\)/);
    expect(src).toMatch(/completeSubmit\(\)/);
  });
});
