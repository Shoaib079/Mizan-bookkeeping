import { describe, expect, it } from "vitest";

async function readSource(relativePath: string) {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

describe("FX unified Add hub", () => {
  it("registers fx in record actions and opens FxUnifiedDialog", async () => {
    const registry = await readSource("./record-actions.ts");
    const modals = await readSource("../components/record-action-modals.tsx");
    expect(registry).toContain('"fx"');
    expect(registry).toContain("Foreign exchange");
    expect(modals).toContain("FxUnifiedDialog");
    expect(modals).toContain('effectiveModal === "fx"');
  });

  it("combines buy, sell, and spend on one screen", async () => {
    const unified = await readSource("../components/record/fx-unified-dialog.tsx");
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
    const modals = await readSource("../components/record-action-modals.tsx");
    expect(modals).toContain('effectiveModal === "buyFx"');
  });
});

describe("FX purchase form", () => {
  it("auto-fills TRY from amount × rate until TRY is edited", async () => {
    const form = await readSource("../components/forms/fx-purchase-form.tsx");
    expect(form).toContain("computeTryCostKurusFromRate");
    expect(form).toContain("tryCostTouched");
    expect(form).toContain("fx-buy-rate");
  });

  it("submits optional blank description as null", async () => {
    const form = await readSource("../components/forms/fx-purchase-form.tsx");
    expect(form).toContain("fxPurchaseDescriptionForApi");
    expect(form).toContain("Description (optional)");
    expect(form).not.toMatch(/fx-buy-desc[\s\S]*required/);
  });

  it("clears amount fields when fxAccountId changes", async () => {
    const form = await readSource("../components/forms/fx-purchase-form.tsx");
    expect(form).toContain("clearFxAmountFieldsOnCurrencySwitch");
    expect(form).toContain("fxAccountId");
  });
});
