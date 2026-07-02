import { describe, expect, it } from "vitest";

import {
  classificationMatchesAmount,
  classificationOptionGroups,
  classificationOptionsForAmount,
  suggestClassificationForLine,
  suggestDeliveryPlatformId,
} from "@/lib/statement-classification-options";

describe("classificationOptionGroups", () => {
  it("lists staff, partner, loan, and bank fee in the full chart", () => {
    const { inflows, outflows } = classificationOptionGroups();
    const all = [...inflows, ...outflows];
    const values = all.map((o) => o.value);
    expect(values).toContain("staff_payment");
    expect(values).toContain("partner_drawing");
    expect(values).toContain("loan_payment");
    expect(values).toContain("bank_fee");
    expect(values).toContain("pos_settlement");
  });
});

describe("classificationMatchesAmount", () => {
  it("rejects outflow types on inflow lines", () => {
    expect(classificationMatchesAmount("bank_fee", 30_608_54)).toBe(false);
    expect(classificationMatchesAmount("pos_settlement", 30_608_54)).toBe(true);
  });
});

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

  it("suggests pos settlement for NET SATIŞ inflow", () => {
    expect(
      suggestClassificationForLine({
        amount_kurus: 3_060_854,
        description: "NET SATIŞ TUTARI INDIA GATE RESTAURANT",
      }),
    ).toBe("pos_settlement");
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
