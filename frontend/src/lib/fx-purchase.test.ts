import { describe, expect, it } from "vitest";

async function readSource(relativePath: string) {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

describe("FX purchase New menu", () => {
  it("registers buyFx in quick actions and opens FxPurchaseQuickAction", async () => {
    const quickActions = await readSource("../components/quick-actions.tsx");
    expect(quickActions).toContain('"buyFx"');
    expect(quickActions).toContain("FxPurchaseQuickAction");
    expect(quickActions).toContain('active === "buyFx"');
  });

  it("lists Buy foreign currency in the New menu", async () => {
    const newMenu = await readSource("../components/new-menu.tsx");
    expect(newMenu).toContain('key: "buyFx"');
    expect(newMenu).toContain("Buy foreign currency");
    expect(newMenu).toContain("Cash & bank");
  });

  it("loads FX wallets before opening FxPurchaseForm", async () => {
    const quickAction = await readSource(
      "../components/forms/fx-purchase-quick-action.tsx",
    );
    expect(quickAction).toContain("loadAllForeignCurrencyAccounts");
    expect(quickAction).toContain("FxPurchaseForm");
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
});
