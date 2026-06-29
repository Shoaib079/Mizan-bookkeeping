import { describe, expect, it } from "vitest";

import {
  clearFxAmountFieldsOnCurrencySwitch,
  computeTryCostKurusFromRate,
  fxPurchaseDescriptionForApi,
  fxWalletToggleLabel,
  shouldClearFxAmountFields,
} from "@/lib/fx-purchase-helpers";

describe("computeTryCostKurusFromRate", () => {
  it("multiplies foreign amount by rate to get TRY paid", () => {
    expect(computeTryCostKurusFromRate("100,00", "34,50")).toBe(345_000);
    expect(computeTryCostKurusFromRate("1,00", "34,50")).toBe(3_450);
  });

  it("returns null when inputs are incomplete", () => {
    expect(computeTryCostKurusFromRate("", "34,50")).toBeNull();
    expect(computeTryCostKurusFromRate("100,00", "")).toBeNull();
  });
});

describe("fxPurchaseDescriptionForApi", () => {
  it("sends null when description is blank", () => {
    expect(fxPurchaseDescriptionForApi("")).toBeNull();
    expect(fxPurchaseDescriptionForApi("   ")).toBeNull();
  });

  it("trims non-empty descriptions", () => {
    expect(fxPurchaseDescriptionForApi("  Market buy  ")).toBe("Market buy");
  });
});

describe("fxWalletToggleLabel", () => {
  it("uppercases currency codes for toggle buttons", () => {
    expect(fxWalletToggleLabel("usd")).toBe("USD");
    expect(fxWalletToggleLabel("EUR")).toBe("EUR");
  });
});

describe("shouldClearFxAmountFields", () => {
  it("clears amount fields when the wallet changes", () => {
    expect(shouldClearFxAmountFields("wallet-a", "wallet-b")).toBe(true);
    expect(shouldClearFxAmountFields("wallet-a", "wallet-a")).toBe(false);
  });
});

describe("clearFxAmountFieldsOnCurrencySwitch", () => {
  it("returns empty amount, rate, and TRY fields", () => {
    expect(clearFxAmountFieldsOnCurrencySwitch()).toEqual({
      nativeText: "",
      rateText: "",
      tryCostText: "",
      tryCostTouched: false,
    });
  });
});
