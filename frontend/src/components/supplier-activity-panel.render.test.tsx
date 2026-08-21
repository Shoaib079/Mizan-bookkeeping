/**
 * @vitest-environment jsdom
 *
 * S4 — supplier activity Edit/Void follow the backend verdict, not callbacks.
 */

import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupplierActivityPanel } from "@/components/supplier-activity-panel";
import { sourceDeclaring } from "@/test-support/source";
import { renderWithQuery } from "@/test-support/render-with-query";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiDownload: vi.fn(),
  triggerBlobDownload: vi.fn(),
  ApiError: class extends Error {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/suppliers/sup-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    grants: ["scope:export", "operations:write"],
    role: "owner",
    loading: false,
    membershipSettled: true,
  }),
}));

vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

function activityPayload(payment: {
  can_edit: boolean;
  can_void: boolean;
  void_path: string | null;
}) {
  return {
    supplier_id: "sup-1",
    supplier_name: "Metro",
    supplier_vkn: "123",
    from_date: "2026-05-01",
    to_date: "2026-05-31",
    opening_balance_kurus: 0,
    closing_balance_kurus: -1_000_000,
    total_invoices_gross_kurus: 0,
    total_payments_kurus: 1_000_000,
    total_vat_kurus: 0,
    rows: [
      {
        movement_date: "2026-05-01",
        movement_kind: "opening",
        movement_label: "Opening",
        document_ref: "—",
        detail: "Balance at start of period",
        net_kurus: null,
        vat_kurus: null,
        amount_kurus: null,
        bank_name: null,
        dekont_ref: null,
        balance_kurus: 0,
        affects_balance: true,
        invoice_draft_id: null,
        journal_entry_id: null,
        has_document: false,
        can_edit: false,
        can_void: false,
        void_path: null,
        expense_account_id: null,
        payment_account_id: null,
        display_kind: "effective",
      },
      {
        movement_date: "2026-05-10",
        movement_kind: "payment",
        movement_label: "Payment",
        document_ref: "—",
        detail: "Capability payment",
        net_kurus: null,
        vat_kurus: null,
        amount_kurus: 1_000_000,
        bank_name: null,
        dekont_ref: null,
        balance_kurus: -1_000_000,
        affects_balance: true,
        invoice_draft_id: null,
        journal_entry_id: "je-pay-1",
        has_document: false,
        can_edit: payment.can_edit,
        can_void: payment.can_void,
        void_path: payment.void_path,
        expense_account_id: null,
        payment_account_id: "acc-1",
        display_kind: "effective",
      },
      {
        movement_date: "2026-05-31",
        movement_kind: "closing",
        movement_label: "Closing",
        document_ref: "—",
        detail: "Balance after posted movements",
        net_kurus: null,
        vat_kurus: null,
        amount_kurus: null,
        bank_name: null,
        dekont_ref: null,
        balance_kurus: -1_000_000,
        affects_balance: true,
        invoice_draft_id: null,
        journal_entry_id: null,
        has_document: false,
        can_edit: false,
        can_void: false,
        void_path: null,
        expense_account_id: null,
        payment_account_id: null,
        display_kind: "effective",
      },
    ],
  };
}

async function paymentRow(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByText("Capability payment")).toBeTruthy(),
  );
  return screen.getByText("Capability payment").closest("tr") as HTMLElement;
}

describe("supplier activity payment Edit/Void from backend verdict", () => {
  it("shows Edit and Void when the payload allows both", async () => {
    apiFetch.mockResolvedValue(
      activityPayload({
        can_edit: true,
        can_void: true,
        void_path: "suppliers/sup-1/payments/je-pay-1/void",
      }),
    );
    renderWithQuery(
      <SupplierActivityPanel
        supplierId="sup-1"
        onCorrectPayment={() => undefined}
        onEditInvoice={() => undefined}
      />,
    );
    const row = await paymentRow();
    expect(row.textContent).toContain("Edit");
    expect(row.textContent).toContain("Void");
  });

  it("hides both when the backend marks the payment non-editable", async () => {
    apiFetch.mockResolvedValue(
      activityPayload({
        can_edit: false,
        can_void: false,
        void_path: null,
      }),
    );
    renderWithQuery(
      <SupplierActivityPanel
        supplierId="sup-1"
        onCorrectPayment={() => undefined}
        onEditInvoice={() => undefined}
      />,
    );
    const row = await paymentRow();
    expect(row.textContent).not.toContain("Edit");
    expect(row.textContent).not.toContain("Void");
  });

  it("mutation: always-on payment callbacks without can_edit/can_void goes red", () => {
    const source = sourceDeclaring("SupplierActivityRowActions");
    const paymentGate =
      "row.can_edit || (row.can_void && Boolean(row.void_path))";
    expect(source).toContain(paymentGate);
    const broken = source.replace(
      paymentGate,
      "Boolean(onCorrectPayment)",
    );
    expect(broken).toContain("Boolean(onCorrectPayment)");
    expect(broken).not.toContain(paymentGate);
  });
});
