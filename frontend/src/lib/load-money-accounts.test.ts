import { describe, expect, it } from "vitest";

import {
  DEFAULT_CASH_DRAWER_NAME,
  cashHomeReferenceAccount,
  defaultMainDrawerId,
  formatCashDrawerOptionLabel,
  formatMoneyAccountOptionLabel,
  isCashHomeDrawerName,
  mainTillAccount,
  preferCashHomeDrawerId,
  shouldShowCashDrawerPicker,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";

const mainDrawer: MoneyAccountOption = {
  id: "d1",
  gl_account_id: "g1",
  name: DEFAULT_CASH_DRAWER_NAME,
  account_kind: "cash",
};

const pettyDrawer: MoneyAccountOption = {
  id: "d2",
  gl_account_id: "g2",
  name: "Petty cash",
  account_kind: "cash",
};

const bank: MoneyAccountOption = {
  id: "b1",
  gl_account_id: "g3",
  name: "Garanti TL",
  account_kind: "bank",
};

describe("cash drawer UI helpers", () => {
  it("hides picker for zero or one cash account", () => {
    expect(shouldShowCashDrawerPicker([])).toBe(false);
    expect(shouldShowCashDrawerPicker([mainDrawer])).toBe(false);
  });

  it("shows picker when multiple cash accounts exist", () => {
    expect(shouldShowCashDrawerPicker([mainDrawer, pettyDrawer])).toBe(true);
  });

  it("uses generic label for a single drawer option", () => {
    expect(formatCashDrawerOptionLabel(mainDrawer.name, [mainDrawer])).toBe(
      "Cash drawer",
    );
    expect(formatCashDrawerOptionLabel(pettyDrawer.name, [pettyDrawer])).toBe(
      "Cash drawer",
    );
  });

  it("uses account names when multiple drawers exist", () => {
    const accounts = [mainDrawer, pettyDrawer];
    expect(formatCashDrawerOptionLabel(mainDrawer.name, accounts)).toBe(
      DEFAULT_CASH_DRAWER_NAME,
    );
    expect(formatCashDrawerOptionLabel(pettyDrawer.name, accounts)).toBe(
      "Petty cash",
    );
  });

  it("prefers seeded main drawer id", () => {
    expect(defaultMainDrawerId([pettyDrawer, mainDrawer])).toBe(mainDrawer.id);
    expect(defaultMainDrawerId([pettyDrawer])).toBe(pettyDrawer.id);
  });

  it("prefers Cash at home for post-close send destination", () => {
    const home = { id: "home", name: "Cash at home" };
    const other = { id: "other", name: "Petty" };
    expect(preferCashHomeDrawerId([mainDrawer, home, other], mainDrawer.id)).toBe(
      "home",
    );
    expect(preferCashHomeDrawerId([mainDrawer, other], mainDrawer.id)).toBe(
      "other",
    );
  });

  it("locks Count/Close to Main till and never picks home", () => {
    const home: MoneyAccountOption = {
      id: "home",
      gl_account_id: "gh",
      name: "Cash at home",
      account_kind: "cash",
    };
    expect(isCashHomeDrawerName(home.name)).toBe(true);
    expect(isCashHomeDrawerName(mainDrawer.name)).toBe(false);
    expect(mainTillAccount([home, mainDrawer, pettyDrawer])).toEqual(mainDrawer);
    expect(mainTillAccount([home, pettyDrawer])).toEqual(pettyDrawer);
    expect(mainTillAccount([home])).toBeNull();
    expect(cashHomeReferenceAccount([mainDrawer, home])).toEqual(home);
    expect(cashHomeReferenceAccount([mainDrawer, pettyDrawer])).toBeNull();
  });

  it("formats money account labels without internal drawer name when sole cash", () => {
    expect(
      formatMoneyAccountOptionLabel(mainDrawer, { cashAccountCount: 1 }),
    ).toBe("Cash drawer");
    expect(formatMoneyAccountOptionLabel(bank, { cashAccountCount: 1 })).toBe(
      "Garanti TL (Bank)",
    );
    expect(
      formatMoneyAccountOptionLabel(mainDrawer, { cashAccountCount: 2 }),
    ).toBe(`${DEFAULT_CASH_DRAWER_NAME} (Cash drawer)`);
  });
});
