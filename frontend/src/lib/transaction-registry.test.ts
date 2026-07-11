import { describe, expect, it } from "vitest";

import {
  GENERIC_CORRECTABLE_SOURCES,
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
  });

  it("labels sources with the shared vocabulary", () => {
    expect(sourceLabel("bank_fee")).toBe("bank charges");
    expect(sourceLabel("customer_credit_sale")).toBe("customer credit sale");
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
