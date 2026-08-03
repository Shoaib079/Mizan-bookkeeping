import { describe, expect, it } from "vitest";

import { statesDiffer } from "@/lib/form-draft";

describe("useFormDirty baseline comparison", () => {
  it("detects field changes against baseline", () => {
    const baseline = { dateText: "01.01.2026", amountText: "100,00" };
    const current = { dateText: "02.01.2026", amountText: "100,00" };
    expect(statesDiffer(baseline, current)).toBe(true);
  });

  it("is clean when values match baseline", () => {
    const snapshot = { dateText: "01.01.2026", amountText: "100,00" };
    expect(statesDiffer(snapshot, { ...snapshot })).toBe(false);
  });
});

describe("edit form dirty policy", () => {
  it("requires a user touch before treating drift as unsaved", () => {
    const baseline = { amountText: "100,00" };
    const current = { amountText: "200,00" };
    const touched = false;
    const dirty =
      touched && baseline !== null && statesDiffer(baseline, current);
    expect(dirty).toBe(false);
  });

  it("warns after the user edits away from baseline", () => {
    const baseline = { amountText: "100,00" };
    const current = { amountText: "200,00" };
    const touched = true;
    const dirty =
      touched && baseline !== null && statesDiffer(baseline, current);
    expect(dirty).toBe(true);
  });

  it("is clean when the user reverts to the loaded values", () => {
    const baseline = { amountText: "100,00" };
    const current = { amountText: "100,00" };
    const touched = true;
    const dirty =
      touched && baseline !== null && statesDiffer(baseline, current);
    expect(dirty).toBe(false);
  });
});
