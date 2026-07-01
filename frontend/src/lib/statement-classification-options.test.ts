import { describe, expect, it } from "vitest";

import {
  classificationOptionsForAmount,
  suggestClassificationForLine,
  suggestDeliveryPlatformId,
} from "@/lib/statement-classification-options";

describe("classificationOptionsForAmount", () => {
  it("includes delivery and POS inflows for positive amounts", () => {
    const values = classificationOptionsForAmount(100_00).map((o) => o.value);
    expect(values).toContain("delivery_settlement");
    expect(values).toContain("pos_settlement");
    expect(values).not.toContain("supplier_payment");
  });

  it("includes supplier payment for outflows", () => {
    const values = classificationOptionsForAmount(-50_00).map((o) => o.value);
    expect(values).toContain("supplier_payment");
    expect(values).not.toContain("delivery_settlement");
  });
});

describe("suggestClassificationForLine", () => {
  it("suggests delivery settlement for Trendyol marketplace text", () => {
    expect(
      suggestClassificationForLine({
        amount_kurus: 223_039,
        description:
          "TYG TURKEY ELEKTRONİK TİCARET HİZMETLERİ TRENDYOL MARKETPLACE ÖDEME",
      }),
    ).toBe("delivery_settlement");
  });
});

describe("suggestDeliveryPlatformId", () => {
  it("matches Trendyol platform from TYG description", () => {
    const id = suggestDeliveryPlatformId("TYG TRENDYOL MARKETPLACE", [
      { id: "p-getir", name: "Getir" },
      { id: "p-ty", name: "Trendyol" },
    ]);
    expect(id).toBe("p-ty");
  });
});
