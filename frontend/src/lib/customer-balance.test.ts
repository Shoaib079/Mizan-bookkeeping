import { describe, expect, it } from "vitest";

import {
  customerBalanceHeading,
  customerBalanceStickerMinor,
  customerDirectoryBalanceLabel,
} from "@/lib/customer-balance";
import { balanceHeading } from "@/lib/subledger-balance";

describe("customer-balance", () => {
  it("maps receivable sign to direction words via inverted balanceHeading", () => {
    expect(customerBalanceHeading(50_000)).toBe("Customer owes you");
    expect(customerBalanceHeading(-25_000)).toBe("You owe customer");
    expect(customerBalanceHeading(0)).toBe("Nothing outstanding");
    expect(balanceHeading(-50_000, "customer")).toBe("Customer owes you");
  });

  it("flips sign for sticker colour semantics", () => {
    expect(customerBalanceStickerMinor(50_000)).toBe(-50_000);
    expect(customerBalanceStickerMinor(-25_000)).toBe(25_000);
  });

  it("directory label keeps aggregate noun when net receivable", () => {
    expect(customerDirectoryBalanceLabel(100_000)).toBe("Total receivable");
    expect(customerDirectoryBalanceLabel(-100)).toBe("You owe customer");
    expect(customerDirectoryBalanceLabel(0)).toBe("Nothing outstanding");
  });
});
