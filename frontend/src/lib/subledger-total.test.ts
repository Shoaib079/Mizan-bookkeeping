import { describe, expect, it } from "vitest";

import { sumBalances, subledgerCountLabel } from "@/lib/subledger-total";

describe("sumBalances", () => {
  it("nets amounts owed against advances held", () => {
    // Two employees owed 10.000 and 5.000, one holding a 2.730 advance.
    const balances = new Map([
      ["a", 1_000_000],
      ["b", 500_000],
      ["c", -273_000],
    ]);
    expect(sumBalances(balances)).toBe(1_227_000);
  });

  it("is zero before anything has loaded", () => {
    expect(sumBalances(new Map())).toBe(0);
  });

  it("can go negative when staff hold more than they are owed", () => {
    // This is the sign the card colours differently — the business is owed.
    expect(sumBalances(new Map([["a", -273_000]]))).toBe(-273_000);
  });
});

describe("subledgerCountLabel", () => {
  it("uses the singular for one", () => {
    expect(subledgerCountLabel(1, "employee")).toBe("1 employee");
  });

  it("pluralises the rest", () => {
    expect(subledgerCountLabel(7, "employee")).toBe("7 employees");
    expect(subledgerCountLabel(0, "partner")).toBe("0 partners");
  });
});
