import { describe, expect, it } from "vitest";

import {
  cardSalesBatchVoidConfirmDetail,
  deliveryReportVoidConfirmDetail,
  deliverySettlementVoidConfirmDetail,
  expenseVoidConfirmDetail,
  fxLedgerVoidConfirmDetail,
  glEntryVoidConfirmDetail,
  manualJournalVoidConfirmDetail,
  posDailySalesVoidConfirmDetail,
  posSettlementVoidConfirmDetail,
} from "@/lib/ledger-void-confirm-detail";

describe("ledger void confirm detail helpers", () => {
  it("formats FX wallet row with native currency", () => {
    expect(
      fxLedgerVoidConfirmDetail({
        movement_date: "2026-08-01",
        movement_type: "purchase",
        native_quantity: 43_200,
        currency: "USD",
        description: "Cash buy",
      }),
    ).toBe("01.08.2026 · FX purchase · $432.00");
  });

  it("formats TRY expense row", () => {
    expect(
      expenseVoidConfirmDetail({
        expense_date: "2026-08-02",
        description: "Metro",
        written_item_description: "Vegetables",
        amount_kurus: 120_000,
      }),
    ).toBe("02.08.2026 · Expense · 1.200,00 ₺");
  });

  it("formats manual journal with total", () => {
    expect(
      manualJournalVoidConfirmDetail({
        entry_date: "2026-08-03",
        description: "Accrual true-up",
        total_kurus: 50_000,
      }),
    ).toBe("03.08.2026 · Manual journal · 500,00 ₺");
  });

  it("formats GL peek entry", () => {
    expect(
      glEntryVoidConfirmDetail({
        entry_date: "2026-08-04",
        source: "invoice",
        amount_kurus: 75_000,
        description: "Supplier invoice",
      }),
    ).toMatch(/04\.08\.2026 · .* · 750,00 ₺/);
  });

  it("formats POS daily sales", () => {
    expect(
      posDailySalesVoidConfirmDetail({
        summary_date: "2026-08-05",
        total_kurus: 200_000,
      }),
    ).toBe("05.08.2026 · Daily sales · 2.000,00 ₺");
  });

  it("formats card sales batch", () => {
    expect(
      cardSalesBatchVoidConfirmDetail({
        sales_date: "2026-08-06",
        gross_amount_kurus: 300_000,
      }),
    ).toBe("06.08.2026 · Card sales batch · 3.000,00 ₺");
  });

  it("formats POS settlement", () => {
    expect(
      posSettlementVoidConfirmDetail({
        settlement_date: "2026-08-07",
        amount_kurus: 400_000,
      }),
    ).toBe("07.08.2026 · POS settlement · 4.000,00 ₺");
  });

  it("formats delivery report with period label", () => {
    expect(
      deliveryReportVoidConfirmDetail({
        period_label: "Aug 2026",
        platform_name: "Yemeksepeti",
        gross_kurus: 500_000,
      }),
    ).toBe("Aug 2026 · Delivery report · Yemeksepeti · 5.000,00 ₺");
  });

  it("formats delivery settlement", () => {
    expect(
      deliverySettlementVoidConfirmDetail({
        settlement_date: "2026-08-08",
        platform_name: "Getir",
        amount_kurus: 600_000,
      }),
    ).toBe("08.08.2026 · Delivery settlement · Getir · 6.000,00 ₺");
  });
});
