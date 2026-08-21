// @vitest-environment jsdom

/** Freshness funnel — mutation-checked (S2).
 *
 * Break on purpose: delete emitLedgerChanged from completeSubmit → red;
 * remove useQuery / "ledger" from a detail page → red.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { LEDGER_CHANGED_EVENT } from "./ledger-events";
import { createSubmitIdempotencyStore } from "./use-submit-idempotency";
import { sourceDeclaring } from "@/test-support/source";

describe("shared money-form success path emits ledger-changed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("completeSubmit dispatches mizan:ledger-changed", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("11111111-1111-4111-8111-111111111111"),
    });

    const store = createSubmitIdempotencyStore();
    store.beginSubmit();

    const heard = vi.fn();
    window.addEventListener(LEDGER_CHANGED_EVENT, heard);
    store.completeSubmit();
    window.removeEventListener(LEDGER_CHANGED_EVENT, heard);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(store.peekKey()).toBeNull();
  });

  it("createSubmitIdempotencyStore.completeSubmit source calls emitLedgerChanged", () => {
    const src = sourceDeclaring("createSubmitIdempotencyStore");
    expect(src).toMatch(/completeSubmit\(\)\s*\{[\s\S]*?emitLedgerChanged\(\)/);
  });
});

describe("detail sticker/ledger fetches are query-backed", () => {
  const pages = [
    "PartnerDetailPage",
    "StaffDetailPage",
    "SupplierDetailPage",
  ] as const;

  for (const name of pages) {
    it(`${name} uses useQuery with a ledger queryKey`, () => {
      const src = sourceDeclaring(name);
      expect(src).toMatch(/useQuery\s*\(/);
      expect(src).toMatch(/["']ledger["']/);
    });
  }

  it("SupplierActivityPanel uses useQuery", () => {
    const src = sourceDeclaring("SupplierActivityPanel");
    expect(src).toMatch(/useQuery\s*\(/);
    expect(src).toMatch(/["']activity["']/);
  });

  it("useLedgerBalanceMap uses useQueries", () => {
    const src = sourceDeclaring("useLedgerBalanceMap");
    expect(src).toMatch(/useQueries\s*\(/);
    expect(src).toMatch(/["']ledger-balance["']/);
  });
});
