import { describe, expect, it } from "vitest";

import {
  filterTransferMoneyAccounts,
  isTransferMoneyAccountKind,
} from "@/lib/load-money-accounts";
import { sourceDeclaring } from "@/test-support/source";

describe("transfer money account kinds", () => {
  it("allows only cash and bank", () => {
    expect(isTransferMoneyAccountKind("cash")).toBe(true);
    expect(isTransferMoneyAccountKind("bank")).toBe(true);
    expect(isTransferMoneyAccountKind("foreign_currency")).toBe(false);
    expect(isTransferMoneyAccountKind("credit_card")).toBe(false);
  });

  it("filters FX and credit cards out of a mixed list", () => {
    const filtered = filterTransferMoneyAccounts([
      { id: "1", account_kind: "cash", name: "Main Drawer" },
      { id: "2", account_kind: "bank", name: "İş BANK" },
      { id: "3", account_kind: "foreign_currency", name: "Dollar" },
      { id: "4", account_kind: "credit_card", name: "World Card" },
      { id: "5", account_kind: "foreign_currency", name: "EURO" },
    ]);
    expect(filtered.map((a) => a.name)).toEqual(["Main Drawer", "İş BANK"]);
    expect(
      filtered.every((a) => a.account_kind === "cash" || a.account_kind === "bank"),
    ).toBe(true);
    expect(filtered.some((a) => a.account_kind === "foreign_currency")).toBe(
      false,
    );
    expect(filtered.some((a) => a.account_kind === "credit_card")).toBe(false);
  });
});

describe("TransferForm account loading (source)", () => {
  it("loads cash+bank via shared helper — not the unfiltered accounts list", () => {
    const source = sourceDeclaring("TransferForm");
    expect(source).toContain("loadBankAndCashAccounts");
    expect(source).not.toContain("/banking/accounts?limit=100");
    expect(source).not.toMatch(/account_kind=foreign_currency/);
    expect(source).not.toMatch(/account_kind=credit_card/);
  });

  it("mutation: switching TransferForm back to unfiltered fetch goes red", () => {
    const source = sourceDeclaring("TransferForm");
    const broken = source.replace(
      "loadBankAndCashAccounts(entityId)",
      'apiFetch(`/entities/${entityId}/banking/accounts?limit=100`)',
    );
    expect(broken).not.toContain("loadBankAndCashAccounts(entityId)");
    expect(source).toContain("loadBankAndCashAccounts(entityId)");
  });
});
