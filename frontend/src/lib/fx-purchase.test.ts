import { describe, expect, it } from "vitest";

async function readSource(relativePath: string) {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

describe("FX purchase Add hub", () => {
  it("registers buyFx in record actions and opens FxPurchaseQuickAction", async () => {
    const registry = await readSource("./record-actions.ts");
    const modals = await readSource("../components/record-action-modals.tsx");
    expect(registry).toContain('"buyFx"');
    expect(modals).toContain("FxPurchaseQuickAction");
    expect(modals).toContain('modalAction === "buyFx"');
  });

  it("lists Buy foreign currency in record actions (Add hub)", async () => {
    const registry = await readSource("./record-actions.ts");
    expect(registry).toContain('"buyFx"');
    expect(registry).toContain("Buy foreign currency");
    expect(registry).toContain('"cashFx"');
  });

  it("shows currency toggles and form on one screen", async () => {
    const quickAction = await readSource(
      "../components/forms/fx-purchase-quick-action.tsx",
    );
    expect(quickAction).toContain("loadAllForeignCurrencyAccounts");
    expect(quickAction).toContain("FxPurchaseFormFields");
    expect(quickAction).toContain("fxWalletToggleLabel");
    expect(quickAction).toContain("aria-pressed");
    expect(quickAction).not.toContain("Combobox");
    expect(quickAction).not.toMatch(/<FxPurchaseForm[\s/>]/);
    expect(quickAction).toContain("Foreign currency wallet");
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

describe("FX purchase currency toggles", () => {
  it("renders one toggle per wallet and drives form props", async () => {
    const quickAction = await readSource(
      "../components/forms/fx-purchase-quick-action.tsx",
    );
    expect(quickAction).toContain("accounts.map");
    expect(quickAction).toContain("fxAccountId={selected.id}");
    expect(quickAction).toContain("currency={selectedCurrency}");
    expect(quickAction).toContain("setSelectedId(account.id)");
  });

  it("keeps the zero-wallet Banking message", async () => {
    const quickAction = await readSource(
      "../components/forms/fx-purchase-quick-action.tsx",
    );
    expect(quickAction).toContain("accounts.length === 0");
    expect(quickAction).toContain('href="/banking"');
  });
});
