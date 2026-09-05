/** Per-account Banking stickers — banks / cards / drawers share HubTileCard. */

import { describe, expect, it } from "vitest";

import type { MoneyAccountLeaf } from "@/lib/banking-types";
import {
  moneyAccountDetailHref,
  moneyAccountStickerIcon,
  moneyAccountStickerLook,
  moneyAccountStickerSubtitle,
  moneyAccountsToHubTiles,
} from "@/lib/money-account-stickers";
import { sourceDeclaring } from "@/test-support/source";

function leaf(
  overrides: Partial<MoneyAccountLeaf> & Pick<MoneyAccountLeaf, "id" | "name">,
): MoneyAccountLeaf {
  return {
    account_kind: "bank",
    currency: null,
    gl_account_code: "1101",
    bank_name: null,
    iban: null,
    last_four: null,
    is_active: true,
    balance_kurus: 0,
    native_quantity: null,
    ...overrides,
  };
}

describe("money-account stickers helpers", () => {
  it("maps last four and bank label into the caption", () => {
    expect(
      moneyAccountStickerSubtitle(
        leaf({
          id: "1",
          name: "İş BANK",
          last_four: "4521",
          bank_name: "İş Bankası",
        }),
      ),
    ).toBe("···4521 · İş Bankası · book balance");

    expect(
      moneyAccountStickerSubtitle(
        leaf({ id: "2", name: "Yapı Kredi", bank_name: "Yapı Kredi" }),
      ),
    ).toBe("book balance");
  });

  it("cycles muted accent looks and picks the right icon", () => {
    expect(moneyAccountStickerLook(0).accent).toBe("blue");
    expect(moneyAccountStickerLook(1).accent).toBe("green");
    expect(moneyAccountStickerIcon("bank")).toBeTruthy();
    expect(moneyAccountStickerIcon("credit_card")).not.toBe(
      moneyAccountStickerIcon("cash"),
    );
    expect(moneyAccountDetailHref("abc")).toBe("/banking/accounts/abc");
  });

  it("builds HubTiles with amounts and accent fields", () => {
    const tiles = moneyAccountsToHubTiles([
      leaf({ id: "a", name: "Garanti", balance_kurus: 12_500_00 }),
      leaf({
        id: "b",
        name: "Card",
        account_kind: "credit_card",
        last_four: "4321",
        balance_kurus: 3_800_00,
      }),
    ]);
    expect(tiles).toHaveLength(2);
    expect(tiles[0]?.href).toBe("/banking/accounts/a");
    expect(tiles[0]?.accent).toBe("blue");
    expect(tiles[1]?.accent).toBe("green");
    expect(tiles[1]?.subtitle).toContain("···4321");
    expect(tiles[0]?.amount).toMatch(/₺|TL/);
  });
});

describe("banks / cards / cash use the shared sticker grid", () => {
  it("branch list and cash drawers render MoneyAccountStickerGrid + HubTileCard", () => {
    const branch = sourceDeclaring("BankingBranchListContent");
    const cash = sourceDeclaring("CashDrawersList");
    const grid = sourceDeclaring("MoneyAccountStickerGrid");

    expect(branch).toContain("MoneyAccountStickerGrid");
    expect(branch).not.toContain("BankAccountBalanceRow");
    expect(branch).not.toContain("divide-y divide-border");

    expect(cash).toContain("MoneyAccountStickerGrid");
    expect(cash).toContain("HubTileCard");
    expect(cash).toContain("Rename");
    expect(cash).not.toContain("<ul className=\"divide-y");

    expect(grid).toContain("HubTileCard");
    expect(grid).not.toContain("BankingHubTile");
  });

  it("HubTileCard accepts optional accent / tint (one tile component)", () => {
    const hub = sourceDeclaring("HubTileCard");
    expect(hub).toContain("accent?: AccentBarTone");
    expect(hub).toContain("iconTint?: IconTint");
    expect(hub).toContain("ACCENT_BAR[accent]");
  });
});
