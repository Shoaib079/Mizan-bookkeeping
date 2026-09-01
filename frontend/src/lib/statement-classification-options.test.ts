import { describe, expect, it } from "vitest";

import {
  classificationComboboxOptionsForAmount,
  classificationMatchesAmount,
  classificationOptionGroups,
  classificationOptionsForAmount,
  deliveryPlatformPickerHint,
  suggestClassificationForLine,
  initialClassificationForLine,
  suggestDeliveryPlatformId,
  suggestSupplierId,
} from "@/lib/statement-classification-options";

describe("classificationComboboxOptionsForAmount", () => {
  it("includes search keywords for supplier and card acquirer", () => {
    const outflow = classificationComboboxOptionsForAmount(-100_00);
    const supplier = outflow.find((o) => o.value === "supplier_payment");
    expect(supplier?.keywords).toMatch(/supplier/i);

    const inflow = classificationComboboxOptionsForAmount(100_00);
    const pos = inflow.find((o) => o.value === "pos_settlement");
    expect(pos?.keywords).toMatch(/acquirer|pos/i);
  });

  it("finds tax-related expense via search keywords", () => {
    const outflow = classificationComboboxOptionsForAmount(-50_00);
    const expense = outflow.find((o) => o.value === "rent_utility");
    expect(expense?.keywords).toMatch(/sgk|vergi|tax/i);
  });
});

describe("classificationOptionGroups", () => {
  it("lists staff, partner, loan, and bank fee in the full chart", () => {
    const { inflows, outflows } = classificationOptionGroups();
    const all = [...inflows, ...outflows];
    const values = all.map((o) => o.value);
    expect(values).toContain("staff_payment");
    expect(values).toContain("partner_drawing");
    expect(values).toContain("partner_profit_paid");
    expect(values).toContain("partner_capital_contribution");
    expect(values).toContain("partner_loan_receipt");
    expect(values).toContain("partner_loan_payment");
    expect(values).toContain("loan_payment");
    expect(values).toContain("bank_fee");
    expect(values).toContain("pos_commission");
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
  it("uses direction-only defaults — no hardcoded bank-text teachers", () => {
    expect(
      suggestClassificationForLine({
        amount_kurus: 223_039,
        description:
          "TYG TURKEY ELEKTRONİK TİCARET HİZMETLERİ TRENDYOL MARKETPLACE ÖDEME",
      }),
    ).toBe("customer_payment");

    expect(
      suggestClassificationForLine({
        amount_kurus: 3_060_854,
        description: "NET SATIŞ TUTARI INDIA GATE RESTAURANT",
      }),
    ).toBe("customer_payment");

    expect(
      suggestClassificationForLine({
        amount_kurus: -3_000,
        description: "POS KOMİSYONU INDIA GATE RESTAURANT",
      }),
    ).toBe("supplier_payment");

    expect(
      suggestClassificationForLine({
        amount_kurus: -768_500,
        description: "GIDEN HAVALE -CA***** TA***** AN*****",
      }),
    ).toBe("supplier_payment");
  });
});

describe("initialClassificationForLine", () => {
  it("keeps posted classification instead of direction fallback", () => {
    expect(
      initialClassificationForLine({
        amount_kurus: -768_500,
        description: "GIDEN HAVALE -CA***** TA***** AN*****",
        classification: "partner_drawing_repayment",
        status: "posted",
      }),
    ).toBe("partner_drawing_repayment");
  });

  it("prefers API/learned suggestion over direction fallback", () => {
    expect(
      initialClassificationForLine({
        amount_kurus: -768_500,
        description: "GIDEN HAVALE -CA***** TA***** AN*****",
        classification: "unclassified",
        status: "imported",
        suggestion: { classification: "bank_fee" },
      }),
    ).toBe("bank_fee");
  });

  it("falls back to direction default when queue line has no suggestion", () => {
    expect(
      initialClassificationForLine({
        amount_kurus: -768_500,
        description: "GIDEN HAVALE -CA***** TA***** AN*****",
        classification: "unclassified",
        status: "imported",
      }),
    ).toBe("supplier_payment");
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

  it("does not default to the first platform when description names another brand", () => {
    const id = suggestDeliveryPlatformId(
      "YEMEK SEPETI ELEKTRONIK ODEME",
      [{ id: "p-getir", name: "Getir" }],
    );
    expect(id).toBeNull();
  });
});

describe("suggestSupplierId", () => {
  it("matches metro from havale description", () => {
    const id = suggestSupplierId(
      "HAVALE EFT METRO GIDA SAN TIC ODEME",
      [{ id: "sup-metro", name: "Metro Gida San Tic Ltd" }],
    );
    expect(id).toBe("sup-metro");
  });
});

describe("deliveryPlatformPickerHint", () => {
  it("explains when Yemeksepeti is missing from delivery platforms", () => {
    const hint = deliveryPlatformPickerHint(
      "YEMEK SEPETI ELEKTRONIK ODEME",
      [{ name: "Getir" }],
    );
    expect(hint).toMatch(/Yemeksepeti/);
    expect(hint).toMatch(/Delivery → Platforms/);
  });
});
