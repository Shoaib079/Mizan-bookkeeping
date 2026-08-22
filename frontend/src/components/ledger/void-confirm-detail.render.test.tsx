// @vitest-environment jsdom

/** Void confirm detail line — every surface shows date · type · amount. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
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
import { sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => true,
}));

afterEach(cleanup);

async function expectConfirmDetail(detail: string): Promise<void> {
  render(
    <VoidTriggerButton confirmDetail={detail} onContinue={() => undefined} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Void" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "Are you sure?" })).toBeTruthy(),
  );
  expect(screen.getByText(detail)).toBeTruthy();
}

describe("void confirm detail on mobile sheet", () => {
  it("FX wallet row shows native currency amount", async () => {
    await expectConfirmDetail(
      fxLedgerVoidConfirmDetail({
        movement_date: "2026-08-01",
        movement_type: "purchase",
        native_quantity: 10_000,
        currency: "USD",
        description: "Buy",
      }),
    );
    expect(screen.getByText(/ \$100\.00$/)).toBeTruthy();
  });

  it("expense review row shows TRY amount", async () => {
    await expectConfirmDetail(
      expenseVoidConfirmDetail({
        expense_date: "2026-08-02",
        description: "Metro",
        amount_kurus: 120_000,
      }),
    );
    expect(screen.getByText(/1\.200,00 ₺/)).toBeTruthy();
  });

  it("POS daily sales shows date · type · amount", async () => {
    await expectConfirmDetail(
      posDailySalesVoidConfirmDetail({
        summary_date: "2026-08-05",
        total_kurus: 200_000,
      }),
    );
  });

  it("card sales batch shows date · type · amount", async () => {
    await expectConfirmDetail(
      cardSalesBatchVoidConfirmDetail({
        sales_date: "2026-08-06",
        gross_amount_kurus: 300_000,
      }),
    );
  });

  it("POS settlement shows date · type · amount", async () => {
    await expectConfirmDetail(
      posSettlementVoidConfirmDetail({
        settlement_date: "2026-08-07",
        amount_kurus: 400_000,
      }),
    );
  });

  it("delivery report shows period · platform · amount", async () => {
    await expectConfirmDetail(
      deliveryReportVoidConfirmDetail({
        period_label: "Aug 2026",
        platform_name: "Yemeksepeti",
        gross_kurus: 500_000,
      }),
    );
  });

  it("delivery settlement shows date · platform · amount", async () => {
    await expectConfirmDetail(
      deliverySettlementVoidConfirmDetail({
        settlement_date: "2026-08-08",
        platform_name: "Getir",
        amount_kurus: 600_000,
      }),
    );
  });

  it("transaction drawer GL entry shows date · source · amount", async () => {
    await expectConfirmDetail(
      glEntryVoidConfirmDetail({
        entry_date: "2026-08-04",
        source: "invoice",
        amount_kurus: 75_000,
        description: "Supplier invoice",
      }),
    );
  });

  it("manual journal shows date · type · total", async () => {
    await expectConfirmDetail(
      manualJournalVoidConfirmDetail({
        entry_date: "2026-08-03",
        description: "Accrual true-up",
        total_kurus: 50_000,
      }),
    );
  });

  it("SubledgerRowActions forwards detail to confirm sheet", async () => {
    const detail = expenseVoidConfirmDetail({
      expense_date: "2026-08-02",
      description: "Metro",
      amount_kurus: 120_000,
    });
    render(
      <SubledgerRowActions
        row={{ display_kind: "effective", journal_entry_id: "je-1" }}
        voidConfirmDetail={detail}
        onEdit={() => undefined}
        onVoid={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(screen.getByText(detail)).toBeTruthy());
  });
});

describe("void confirm detail mutation guard", () => {
  it("mutation: drop expenseVoidConfirmDetail on expenses panel fails", () => {
    const src = sourceDeclaring("ExpensesReviewPanel");
    expect(src).toContain("expenseVoidConfirmDetail");
    expect(src).toContain("voidConfirmDetail={expenseVoidConfirmDetail(row)}");
    const broken = src.replace("voidConfirmDetail={expenseVoidConfirmDetail(row)}", "");
    expect(broken).not.toContain("voidConfirmDetail={expenseVoidConfirmDetail(row)}");
  });
});
