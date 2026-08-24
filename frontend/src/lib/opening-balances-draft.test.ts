import { describe, expect, it } from "vitest";

import {
  isOpeningBalancesDraftEmpty,
  newOpeningBalanceLine,
  openingBalanceLineHint,
  openingBalanceLineToPayload,
  openingBalanceSideTotal,
} from "@/lib/opening-balances-draft";

describe("opening-balances-draft", () => {
  it("treats a blank single line as empty draft", () => {
    expect(
      isOpeningBalancesDraftEmpty({
        goLiveDate: "",
        lines: [newOpeningBalanceLine()],
      }),
    ).toBe(true);
    expect(
      isOpeningBalancesDraftEmpty({
        goLiveDate: "01.01.2026",
        lines: [newOpeningBalanceLine()],
      }),
    ).toBe(false);
  });

  it("hints incomplete lines and builds money-account payload", () => {
    const line = {
      ...newOpeningBalanceLine(),
      target: "money_account" as const,
      amountTry: "",
    };
    expect(openingBalanceLineHint(line)).toBe("Enter an amount.");
    const ready = {
      ...line,
      amountTry: "1.000,00",
      moneyAccountId: "cash-1",
    };
    expect(openingBalanceLineHint(ready)).toBeNull();
    expect(openingBalanceLineToPayload(ready)).toEqual({
      money_account_id: "cash-1",
      amount_kurus: 100_000,
    });
  });

  it("sums GL debit/credit sides only", () => {
    const debit = {
      ...newOpeningBalanceLine(),
      target: "account" as const,
      side: "debit" as const,
      amountTry: "10,00",
    };
    const credit = {
      ...newOpeningBalanceLine(),
      target: "account" as const,
      side: "credit" as const,
      amountTry: "5,00",
    };
    const money = {
      ...newOpeningBalanceLine(),
      target: "money_account" as const,
      amountTry: "99,00",
    };
    expect(openingBalanceSideTotal([debit, credit, money], "debit")).toBe(1000);
    expect(openingBalanceSideTotal([debit, credit, money], "credit")).toBe(500);
  });
});
