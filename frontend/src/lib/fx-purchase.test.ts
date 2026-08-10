import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";


describe("FX unified Add hub", () => {
  it("registers fx in record actions and opens FxUnifiedDialog", async () => {
    const registry = sourceDeclaring("PERSON_PICKER_ACTIONS");
    const modals = sourceDeclaring("RecordActionModals");
    expect(registry).toContain('"fx"');
    expect(registry).toContain("Foreign exchange");
    expect(modals).toContain("FxUnifiedDialog");
    expect(modals).toContain('effectiveModal === "fx"');
  });

  it("combines buy, sell, and spend on one screen", async () => {
    const unified = sourceDeclaring("FxUnifiedDialog");
    expect(unified).toContain("loadAllForeignCurrencyAccounts");
    expect(unified).toContain("FxPurchaseFormFields");
    expect(unified).toContain("FxConversionForm");
    expect(unified).toContain("FxExpenseSpendForm");
    expect(unified).toContain('"buy"');
    expect(unified).toContain('"convert"');
    expect(unified).toContain('"spend"');
    expect(unified).toContain("Sell");
  });

  it("keeps legacy buyFx key wired to the unified dialog", async () => {
    const modals = sourceDeclaring("RecordActionModals");
    expect(modals).toContain('effectiveModal === "buyFx"');
  });
});

describe("FX purchase form", () => {
  it("auto-fills TRY from amount × rate until TRY is edited", async () => {
    const form = sourceDeclaring("FxPurchaseForm");
    expect(form).toContain("computeTryCostKurusFromRate");
    expect(form).toContain("tryCostTouched");
    expect(form).toContain("fx-buy-rate");
  });

  it("submits optional blank description as null", async () => {
    const form = sourceDeclaring("FxPurchaseForm");
    expect(form).toContain("fxPurchaseDescriptionForApi");
    expect(form).toContain("Description (optional)");
    expect(form).not.toMatch(/fx-buy-desc[\s\S]*required/);
  });

  it("clears amount fields when fxAccountId changes", async () => {
    const form = sourceDeclaring("FxPurchaseForm");
    expect(form).toContain("clearFxAmountFieldsOnCurrencySwitch");
    expect(form).toContain("fxAccountId");
  });
});
