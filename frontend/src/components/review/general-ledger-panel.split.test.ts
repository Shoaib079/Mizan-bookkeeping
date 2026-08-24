import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("GeneralLedgerPanel split", () => {
  it("composes filters + table via hook (not a monolith)", () => {
    const panel = sourceDeclaring("LedgerPanelContent");
    expect(panel).toContain("GeneralLedgerFilters");
    expect(panel).toContain("GeneralLedgerTable");
    expect(panel).toContain("useGeneralLedgerPanel");
  });

  it("mutation: ledger list fetch lives in the hook, not the panel shell", () => {
    const panel = sourceDeclaring("LedgerPanelContent");
    expect(panel).not.toContain("apiFetch");
    expect(panel).not.toContain("ledger/entries");
    const hook = sourceDeclaring("useGeneralLedgerPanel");
    expect(hook).toContain("apiFetch");
    expect(hook).toContain("ledger/entries");
  });
});
