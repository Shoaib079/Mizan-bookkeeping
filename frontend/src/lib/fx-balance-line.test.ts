/** A forex balance is signed, and the sign changes the sentence.
 *
 * This exists because the first version of the customer FX display printed
 * `Owed: ${formatFxNative(minor)}` for whatever the backend returned. On real
 * India Gate data that produced "Owed: -$298.00" — a customer who had paid
 * more USD than was ever billed. The figure was arithmetically right and the
 * sentence was wrong, which is the kind of thing tests written against
 * hand-made fixtures never catch, because nobody invents an overpayment.
 */

import { describe, expect, it } from "vitest";

import {
  formatForexBalanceLine,
  formatForexBalanceSummary,
} from "./fx-money";

describe("formatForexBalanceLine", () => {
  it("calls a positive balance owed", () => {
    const line = formatForexBalanceLine(9400, "USD");
    expect(line.label).toBe("Owed");
    expect(line.amount).toBe("$94.00");
    expect(line.isCredit).toBe(false);
  });

  it("calls a negative balance paid ahead, and never prints a minus", () => {
    // The exact figure from India Gate's ledger: 624 USD billed, 922 received.
    const line = formatForexBalanceLine(-29800, "USD");
    expect(line.label).toBe("Paid ahead");
    expect(line.amount).toBe("$298.00");
    expect(line.amount).not.toContain("-");
    expect(line.isCredit).toBe(true);
  });
});

describe("formatForexBalanceSummary", () => {
  it("is null when there is nothing to say", () => {
    expect(formatForexBalanceSummary(undefined)).toBeNull();
    expect(formatForexBalanceSummary([])).toBeNull();
  });

  it("labels each currency separately", () => {
    // An agency can owe on one booking and be in credit on another; a single
    // label for the row would be wrong for one of them.
    expect(
      formatForexBalanceSummary([
        { currency: "USD", minor: 9400 },
        { currency: "EUR", minor: -1200 },
      ]),
    ).toBe("Owed: $94.00 · Paid ahead: €12.00");
  });

  it("renders an overpaid-only customer without a stray minus", () => {
    const summary = formatForexBalanceSummary([
      { currency: "USD", minor: -29800 },
    ]);
    expect(summary).toBe("Paid ahead: $298.00");
    expect(summary).not.toContain("-");
  });
});
