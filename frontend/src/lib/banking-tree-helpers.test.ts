import { describe, expect, it } from "vitest";

import type { MoneyAccountLeaf, MoneyAccountTree } from "@/lib/banking-types";
import {
  accountCountLabel,
  accountSubtitle,
  allFxAccounts,
  canDeactivateFxWallet,
  formatFxTileSummary,
  mergeFxLedgerEntries,
} from "@/lib/banking-tree-helpers";

function branch(accounts: MoneyAccountLeaf[]) {
  return {
    bucket_code: "1100",
    bucket_name_en: "Bank",
    bucket_name_tr: "Banka",
    balance_kurus: 0,
    accounts,
  };
}

function fxAccount(
  overrides: Partial<MoneyAccountLeaf> & Pick<MoneyAccountLeaf, "id" | "currency">,
): MoneyAccountLeaf {
  return {
    name: overrides.name ?? `${overrides.currency} wallet`,
    account_kind: "foreign_currency",
    gl_account_code: "1010",
    bank_name: null,
    iban: null,
    last_four: null,
    is_active: true,
    balance_kurus: 0,
    native_quantity: 0,
    ...overrides,
  };
}

function treeWithFx(accounts: MoneyAccountLeaf[]): MoneyAccountTree {
  const usd = accounts.filter((a) => a.currency === "USD");
  const eur = accounts.filter((a) => a.currency === "EUR");
  const gbp = accounts.filter((a) => a.currency === "GBP");
  return {
    banks: branch([]),
    cash: branch([]),
    credit_cards: branch([]),
    foreign_currency: {
      usd: { ...branch(usd), bucket_code: "1010", bucket_name_en: "USD" },
      eur: { ...branch(eur), bucket_code: "1020", bucket_name_en: "EUR" },
      gbp: { ...branch(gbp), bucket_code: "1030", bucket_name_en: "GBP" },
    },
  };
}

describe("banking-tree-helpers", () => {
  it("collects active FX accounts across currency branches", () => {
    const tree = treeWithFx([
      fxAccount({ id: "1", currency: "USD", native_quantity: 100_00 }),
      fxAccount({ id: "2", currency: "EUR", is_active: false }),
      fxAccount({ id: "3", currency: "GBP", native_quantity: 50_00 }),
    ]);
    expect(allFxAccounts(tree).map((a) => a.id)).toEqual(["1", "3"]);
  });

  it("formats FX tile summary from native balances", () => {
    const tree = treeWithFx([
      fxAccount({ id: "1", currency: "USD", native_quantity: 1_200_00 }),
      fxAccount({ id: "2", currency: "EUR", native_quantity: 800_00 }),
    ]);
    expect(formatFxTileSummary(allFxAccounts(tree))).toBe("$1,200.00 · €800.00");
  });

  it("merges ledger rows sorted by movement date descending", () => {
    const wallets = [
      fxAccount({ id: "w1", currency: "USD", name: "USD Main" }),
      fxAccount({ id: "w2", currency: "EUR", name: "EUR Petty" }),
    ];
    const merged = mergeFxLedgerEntries(
      wallets,
      new Map([
        [
          "w1",
          [
            {
              id: "a",
              fx_money_account_id: "w1",
              movement_date: "2026-05-01",
              movement_type: "purchase",
              native_quantity: 100,
              try_cost_kurus: 3500,
              description: "Buy",
              journal_entry_id: "j1",
              created_at: "2026-05-01T10:00:00Z",
            },
          ],
        ],
        [
          "w2",
          [
            {
              id: "b",
              fx_money_account_id: "w2",
              movement_date: "2026-05-10",
              movement_type: "spend",
              native_quantity: -50,
              try_cost_kurus: 1750,
              description: "Spend",
              journal_entry_id: "j2",
              created_at: "2026-05-10T10:00:00Z",
            },
          ],
        ],
      ]),
    );
    expect(merged.map((row) => row.id)).toEqual(["b", "a"]);
    expect(merged[0]?.wallet_name).toBe("EUR Petty");
  });

  it("labels account counts and subtitles", () => {
    expect(accountCountLabel(1, "account")).toBe("1 account");
    expect(accountCountLabel(2, "card", "cards")).toBe("2 cards");
    expect(
      accountSubtitle([
        fxAccount({ id: "1", currency: "USD", name: "USD Main" }),
        fxAccount({ id: "2", currency: "EUR", name: "EUR Petty" }),
      ]),
    ).toBe("USD Main, EUR Petty");
  });

  it("allows deactivate only when FX wallet has zero balance", () => {
    expect(
      canDeactivateFxWallet(
        fxAccount({ id: "1", currency: "USD", native_quantity: 0, balance_kurus: 0 }),
      ),
    ).toBe(true);
    expect(
      canDeactivateFxWallet(
        fxAccount({ id: "2", currency: "USD", native_quantity: 100, balance_kurus: 0 }),
      ),
    ).toBe(false);
  });
});
