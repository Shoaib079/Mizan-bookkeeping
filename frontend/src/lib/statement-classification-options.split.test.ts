import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("statement-classification-options split", () => {
  it("barrel re-exports types, catalog, and helpers", () => {
    const barrel = sourceAt("lib/statement-classification-options.ts");
    expect(barrel).toContain('from "@/lib/statement-classification-types"');
    expect(barrel).toContain('from "@/lib/statement-classification-catalog"');
    expect(barrel).toContain('from "@/lib/statement-classification-helpers"');
    expect(barrel).toContain("STATEMENT_CLASSIFICATION_OPTIONS");
    expect(barrel).toContain("classificationComboboxOptionsForAmount");
    expect(barrel).toContain("suggestClassificationForLine");
  });

  it("catalog owns options; helpers own suggestions", () => {
    expect(sourceDeclaring("STATEMENT_CLASSIFICATION_OPTIONS")).toContain(
      "Repay partner (partner-paid expenses)",
    );
    expect(sourceDeclaring("suggestClassificationForLine")).toContain(
      "customer_payment",
    );
    expect(sourceDeclaring("suggestClassificationForLine")).toContain(
      "Do not hardcode bank-text",
    );
    expect(sourceDeclaring("suggestSupplierId")).toContain("toLocaleLowerCase");
  });
});
