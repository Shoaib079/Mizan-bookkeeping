// @vitest-environment jsdom

/** Pressing Edit opens the right form, for every kind the backend offers.
 *
 * `gl-edit-kinds.test.ts` compares two lists of strings by reading source. It
 * catches a kind with no `case`, which was the bug that produced five dead
 * Edit buttons. It cannot catch a `case` that sets the wrong state, or a
 * dialog that stopped being rendered, because it never runs the component.
 *
 * That gap is why D6 sat undone: collapsing twelve `useState` pairs into one
 * edit target is behaviour-preserving only if something checks the behaviour,
 * and `tsc` will happily accept a refactor that wires `partner_ledger` to the
 * staff form. Both are objects with the right shape.
 *
 * So this presses the button. Every child form is replaced by a marker, which
 * makes the test about the wiring and nothing else — a form's own fields,
 * validation and submit are its business and would make this brittle for no
 * gain. What is asserted is: this kind, this dialog, these values.
 *
 * Written before the refactor and expected to pass unchanged after it. That
 * is the whole point of it existing.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const toast = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast }) }));

/** Each form becomes a marker carrying the props it was handed.
 *
 * `data-props` rather than a snapshot: the assertion should name the one or
 * two values that identify the row, so a failure says "the staff form opened
 * with the partner's id" instead of printing a diff of everything.
 */
function marker(name: string) {
  return function Marker(props: Record<string, unknown>) {
    if (props.open === false) return null;
    return (
      <div data-testid={name} data-props={JSON.stringify(props, replacer)} />
    );
  };
}

function replacer(_key: string, value: unknown) {
  return typeof value === "function" ? undefined : value;
}

vi.mock("@/components/forms/correct-expense-form", () => ({
  CorrectExpenseForm: marker("expense"),
}));
vi.mock("@/components/forms/correct-partner-ledger-form", () => ({
  CorrectPartnerLedgerForm: marker("partner_ledger"),
}));
vi.mock("@/components/forms/correct-partner-profit-allocation-form", () => ({
  CorrectPartnerProfitAllocationForm: marker("partner_profit_allocation"),
}));
vi.mock("@/components/forms/correct-staff-ledger-form", () => ({
  CorrectStaffLedgerForm: marker("staff_ledger"),
}));
vi.mock("@/components/forms/correct-customer-payment-form", () => ({
  CorrectCustomerPaymentForm: marker("customer_payment"),
}));
vi.mock("@/components/forms/correct-credit-sale-form", () => ({
  CorrectCreditSaleForm: marker("customer_credit_sale"),
}));
vi.mock("@/components/forms/customer-write-off-dialog", () => ({
  CustomerWriteOffDialog: marker("customer_write_off"),
}));
vi.mock("@/components/forms/correct-fx-purchase-form", () => ({
  CorrectFxPurchaseForm: marker("fx_purchase"),
}));
vi.mock("@/components/forms/correct-fx-ledger-form", () => ({
  CorrectFxLedgerForm: marker("fx_ledger"),
}));
vi.mock("@/components/forms/correct-delivery-commission-form", () => ({
  CorrectDeliveryCommissionForm: marker("delivery_commission"),
}));
vi.mock("@/components/forms/correct-supplier-invoice-form", () => ({
  CorrectSupplierInvoiceForm: marker("supplier_invoice"),
}));
vi.mock("@/components/forms/correct-supplier-payment-form", () => ({
  CorrectSupplierPaymentForm: marker("supplier_payment"),
}));
vi.mock("@/components/forms/group-sale-edit-loader", () => ({
  GroupSaleEditLoader: marker("group_sale"),
}));
vi.mock("@/components/forms/void-subledger-dialog", () => ({
  VoidSubledgerDialog: marker("void"),
}));

const { GlEntryActions } = await import("@/components/ledger/gl-entry-actions");

const ROW = {
  id: "je-1",
  entry_date: "2026-05-01",
  description: "A posted entry",
  status: "posted",
};

/** One case per edit kind: what the backend answers, and what must open.
 *
 * `source` matters — the component asks `subledger-actions` whether to use the
 * generic endpoints before it ever calls the API, so a source that routes to
 * the generic path never reaches these contexts.
 */
const CASES: {
  kind: string;
  source: string;
  context: Record<string, unknown>;
  expect: (props: Record<string, unknown>) => void;
}[] = [
  {
    kind: "expense",
    source: "expense_entry",
    context: {
      id: "ex-1",
      expense_date: "2026-05-01",
      description: "Cleaning",
      written_item_description: null,
      notes: null,
      amount_kurus: 450,
      expense_account_id: "a-1",
      money_account_id: "m-1",
      status: "posted",
      journal_entry_id: "je-1",
    },
    expect: (props) =>
      expect((props.expense as { id?: string }).id).toBe("ex-1"),
  },
  {
    kind: "customer_credit_sale",
    source: "customer_credit_sale",
    context: {
      customer_id: "c-3",
      movement_date: "2026-05-01",
      amount_kurus: 6000,
      description: "Credit sale",
    },
    expect: (props) => expect(props.customerId).toBe("c-3"),
  },
  {
    kind: "partner_ledger",
    source: "partner_drawing",
    context: {
      partner_id: "p-1",
      movement_date: "2026-05-01",
      movement_type: "capital_contribution",
      amount_kurus: 1000,
      description: "Capital",
    },
    expect: (props) => expect(props.partnerId).toBe("p-1"),
  },
  {
    kind: "staff_ledger",
    source: "staff_accrual",
    context: {
      employee_id: "e-1",
      movement_date: "2026-05-01",
      movement_type: "salary_accrual",
      amount_kurus: 5000,
      description: "Salary",
    },
    expect: (props) => expect(props.employeeId).toBe("e-1"),
  },
  {
    kind: "customer_payment",
    source: "customer_payment_received",
    context: {
      customer_id: "c-1",
      movement_date: "2026-05-01",
      amount_kurus: 2500,
      description: "Payment",
    },
    expect: (props) => expect(props.customerId).toBe("c-1"),
  },
  {
    kind: "customer_write_off",
    source: "group_sale",
    context: {
      customer_id: "c-2",
      journal_entry_id: "je-1",
      amount_kurus: 300,
      description: "Write-off",
      balance_kurus: 900,
    },
    expect: (props) => expect(props.customerId).toBe("c-2"),
  },
  {
    kind: "group_sale",
    source: "group_sale",
    context: { group_sale_id: "gs-9" },
    expect: (props) => expect(props.groupSaleId).toBe("gs-9"),
  },
  {
    kind: "supplier_invoice",
    source: "invoice",
    context: {
      supplier_id: "s-1",
      invoice_date: "2026-05-01",
      amount_kurus: 4000,
      description: "Invoice",
    },
    expect: (props) => expect(props.supplierId).toBe("s-1"),
  },
  {
    kind: "supplier_payment",
    source: "payment",
    context: {
      supplier_id: "s-2",
      payment_date: "2026-05-01",
      amount_kurus: 700,
      description: "Payment",
    },
    expect: (props) => expect(props.supplierId).toBe("s-2"),
  },
  {
    kind: "fx_purchase",
    source: "fx_purchase",
    context: {
      money_account_id: "m-1",
      currency: "USD",
      purchase_date: "2026-05-01",
      native_quantity: 100,
      amount_kurus: 3000,
      description: "FX buy",
    },
    expect: (props) => expect(props.currency).toBe("USD"),
  },
  {
    kind: "fx_ledger",
    source: "fx_expense_spend",
    context: {
      money_account_id: "m-2",
      currency: "EUR",
      movement_date: "2026-05-01",
      native_quantity: 50,
      amount_kurus: 1800,
      description: "FX spend",
    },
    expect: (props) => expect(props.currency).toBe("EUR"),
  },
  {
    kind: "delivery_commission",
    source: "delivery_commission",
    context: {
      movement_date: "2026-05-01",
      gross_kurus: 900,
      description: "Commission",
    },
    // The prop is `invoice` — a commission is an invoice from the platform.
    expect: (props) => expect(props.invoice).toBeTruthy(),
  },
  {
    kind: "partner_profit_allocation",
    source: "partner_profit_allocation",
    context: {
      allocation_date: "2026-05-01",
      description: "Allocation",
      profit_kurus: 12000,
    },
    expect: (props) =>
      expect((props.entry as { profit_kurus?: number }).profit_kurus).toBe(12000),
  },
];

function renderRow(source: string, onGenericEdit = vi.fn()) {
  render(
    <GlEntryActions
      row={{ ...ROW, source }}
      onGenericEdit={onGenericEdit}
      onSaved={vi.fn()}
    />,
  );
}

function pressEdit() {
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
}

function propsOf(testId: string): Record<string, unknown> {
  const node = screen.getByTestId(testId);
  return JSON.parse(node.getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  apiFetch.mockReset();
  toast.mockReset();
});

afterEach(cleanup);

describe("pressing Edit in the General ledger", () => {
  it("has a case for every kind the table below covers", () => {
    // Guard the guard: an empty CASES list would make every test below
    // vacuous, and this file exists to be exhaustive.
    expect(CASES.length).toBeGreaterThanOrEqual(13);
    expect(new Set(CASES.map((c) => c.kind)).size).toBe(CASES.length);
  });

  it.each(CASES)("$kind opens its own form", async ({ kind, source, context, expect: check }) => {
    apiFetch.mockResolvedValue({
      can_edit: true,
      can_void: true,
      void_path: "ledger/entries/je-1/void",
      edit: { kind, context },
    });

    renderRow(source);
    pressEdit();

    await waitFor(() => expect(screen.getByTestId(kind)).toBeTruthy());
    check(propsOf(kind));

    // Exactly one. A refactor that leaves an old dialog mounted alongside the
    // new one is invisible to the assertion above.
    const others = CASES.filter((c) => c.kind !== kind).flatMap((c) =>
      screen.queryAllByTestId(c.kind),
    );
    expect(others).toEqual([]);
  });

  it("hands a manual journal back to the page instead of opening a form", async () => {
    // `generic_ledger` is the one kind with no correction form: the General
    // ledger page has its own editor for a manual journal. It is the reason
    // "handled" cannot simply mean "has a dialog".
    const onGenericEdit = vi.fn();
    apiFetch.mockResolvedValue({
      can_edit: true,
      can_void: true,
      void_path: "ledger/entries/je-1/void",
      edit: { kind: "generic_ledger", context: {} },
    });

    renderRow("manual", onGenericEdit);
    pressEdit();

    await waitFor(() => expect(onGenericEdit).toHaveBeenCalledTimes(1));
    for (const c of CASES) expect(screen.queryByTestId(c.kind)).toBeNull();
  });

  it("says so when the backend offers a kind nothing handles", async () => {
    // The `default` arm. It used to `return`, which is how Edit came to
    // render on supplier invoices and do nothing at all when pressed.
    apiFetch.mockResolvedValue({
      can_edit: true,
      can_void: true,
      void_path: null,
      edit: { kind: "something_new", context: {} },
    });

    renderRow("invoice");
    pressEdit();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(toast.mock.calls[0][0])).toContain("something_new");
  });

  it("opens no dialog at all when the entry cannot be edited", async () => {
    apiFetch.mockResolvedValue({
      can_edit: false,
      can_void: true,
      void_path: "ledger/entries/je-1/void",
      edit: null,
    });

    renderRow("invoice");
    pressEdit();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    for (const c of CASES) expect(screen.queryByTestId(c.kind)).toBeNull();
  });
});

describe("pressing Void in the General ledger", () => {
  it("passes the path the backend gave, under the entity", async () => {
    apiFetch.mockResolvedValue({
      can_edit: false,
      can_void: true,
      void_path: "suppliers/s-1/invoices/je-1/void",
      edit: null,
    });

    renderRow("invoice");

    // Void is two steps. `VoidTriggerButton` opens a confirm dialog, and only
    // its Continue button calls back — deliberately, since voiding writes a
    // reversal into the ledger. Clicking once and expecting the dialog would
    // have been a test that passed while the confirmation was removed.
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to void" }));

    await waitFor(() => expect(screen.getByTestId("void")).toBeTruthy());
    expect(propsOf("void").voidPath).toBe(
      "/entities/ent-1/suppliers/s-1/invoices/je-1/void",
    );
  });
});
