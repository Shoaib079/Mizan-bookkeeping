import { describe, expect, it } from "vitest";

import {
  buildStaffLedgerDisplayDescription,
  noteFromPayload,
} from "@/lib/staff-ledger-description";
import {
  buildFxPurchaseDescription,
  buildFxConversionDescription,
  buildFxSpendDescription,
} from "@/lib/fx-ledger-description";
import { buildPartnerLedgerDisplayDescription } from "@/lib/partner-ledger-description";

describe("staff ledger descriptions", () => {
  it("composes payment with name and period", () => {
    expect(
      buildStaffLedgerDisplayDescription({
        movementType: "salary_payment",
        employeeName: "Ali",
        periodYear: 2026,
        periodMonth: 8,
      }),
    ).toBe("Salary payment · Ali · Aug 2026");
  });

  it("composes accrual with name and period", () => {
    expect(
      buildStaffLedgerDisplayDescription({
        movementType: "salary_accrued",
        employeeName: "Ali",
        periodYear: 2026,
        periodMonth: 8,
      }),
    ).toBe("Salary Aug 2026 · Ali");
  });

  it("appends owner note only when present", () => {
    expect(
      buildStaffLedgerDisplayDescription({
        movementType: "advance_paid",
        employeeName: "Ali",
        note: "urgent",
      }),
    ).toBe("Advance · Ali — urgent");
  });

  it("mutation: bare Salary payment alone is not a finished description", () => {
    const composed = buildStaffLedgerDisplayDescription({
      movementType: "salary_payment",
      employeeName: "Ali",
      periodYear: 2026,
      periodMonth: 8,
      note: noteFromPayload("Salary payment"),
    });
    expect(composed).not.toBe("Salary payment");
    expect(composed).toContain("Ali");
  });
});

describe("FX ledger descriptions", () => {
  it("composes purchase with qty, rate, and cash account", () => {
    expect(
      buildFxPurchaseDescription({
        nativeQuantity: 10_000,
        currency: "USD",
        tryCostKurus: 3_500_000,
        cashAccountName: "Main drawer",
      }),
    ).toBe("FX purchase · 100.00 USD @ 350,00 ₺ · from Main drawer");
  });

  it("composes conversion with TRY received", () => {
    expect(
      buildFxConversionDescription({
        nativeQuantity: 5_000,
        currency: "USD",
        tryReceivedKurus: 180_000,
      }),
    ).toBe("FX conversion · 50.00 USD → 1.800,00 ₺");
  });

  it("composes spend with expense text", () => {
    expect(
      buildFxSpendDescription({
        nativeQuantity: 2_000,
        currency: "EUR",
        expenseDescription: "kitchen supplies",
      }),
    ).toBe("FX spend · 20.00 EUR · kitchen supplies");
  });

  it("mutation: bare FX purchase alone is not a finished description", () => {
    const composed = buildFxPurchaseDescription({
      nativeQuantity: 5_000,
      currency: "USD",
      tryCostKurus: 175_000,
      cashAccountName: "Drawer",
      note: null,
    });
    expect(composed).not.toBe("FX purchase");
    expect(composed).toContain("USD");
  });
});

describe("partner ledger descriptions", () => {
  it("fallback includes partner name", () => {
    expect(
      buildPartnerLedgerDisplayDescription({
        movementType: "drawing",
        partnerName: "Mehmet",
      }),
    ).toBe("Drawing · Mehmet");
  });

  it("appends subject when present", () => {
    expect(
      buildPartnerLedgerDisplayDescription({
        movementType: "salary_fronted",
        partnerName: "Mehmet",
        subjectName: "Ali",
      }),
    ).toBe("Salary paid for staff · Mehmet · Ali");
  });

  it("mutation: bare Partner cash payment alone is not a finished description", () => {
    const composed = buildPartnerLedgerDisplayDescription({
      movementType: "drawing",
      partnerName: "Mehmet",
      note: null,
    });
    expect(composed).not.toBe("Partner cash payment");
    expect(composed).toContain("Mehmet");
  });
});
