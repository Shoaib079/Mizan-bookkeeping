import { describe, expect, it } from "vitest";

import {
  GENERIC_CORRECTABLE_SOURCES,
  GENERIC_VOID_SAFE_SOURCES,
  JOURNAL_SOURCES,
  genericVoidPath,
  ledgerEntryHref,
  sourceFlow,
  sourceLabel,
} from "@/lib/transaction-registry";

describe("transaction registry (audit C1)", () => {
  it("maps every non-system journal source to a flow page", () => {
    for (const source of JOURNAL_SOURCES) {
      if (source === "system") continue;
      expect(sourceFlow(source), `flow for ${source}`).not.toBeNull();
    }
  });

  it("keeps the generic void allowlist to accounting-safe sources only", () => {
    expect([...GENERIC_CORRECTABLE_SOURCES].sort()).toEqual(["bank_fee", "manual"]);
    expect(GENERIC_VOID_SAFE_SOURCES.has("transfer")).toBe(true);
    expect(GENERIC_VOID_SAFE_SOURCES.has("cash_drawer_close")).toBe(true);
    expect(GENERIC_VOID_SAFE_SOURCES.has("cash_movement")).toBe(false);
  });

  it("labels sources with clear books language (no app jargon)", () => {
    expect(sourceLabel("bank_fee")).toBe("Bank fee");
    expect(sourceLabel("customer_credit_sale")).toBe("Customer credit sale");
    expect(sourceLabel("rule_auto")).toBe("Bank transaction");
    expect(sourceLabel("system")).toBe("Other income");
    expect(sourceLabel("manual")).toBe("Adjustment");
    expect(sourceLabel("pos_commission_sweep")).toBe("Card commission");
    for (const source of JOURNAL_SOURCES) {
      const label = sourceLabel(source);
      expect(label).toBeTruthy();
      expect(label.includes("_")).toBe(false);
      const lowered = label.toLowerCase();
      for (const banned of ["auto", "rule", "system", "sweep", "batch"]) {
        expect(lowered.split(/\s+/)).not.toContain(banned);
      }
    }
  });

  it("builds GL focus links and generic void paths", () => {
    expect(ledgerEntryHref("abc")).toBe("/reports/ledger?focus=abc");
    expect(genericVoidPath("e1", "j1")).toBe("/entities/e1/ledger/entries/j1/void");
  });

  it("never routes a subledger-backed source's flow to the generic ledger", () => {
    for (const source of JOURNAL_SOURCES) {
      if (GENERIC_CORRECTABLE_SOURCES.has(source) || source === "system") continue;
      expect(sourceFlow(source)?.href, source).not.toBe("/reports/ledger");
    }
  });
});
