// @vitest-environment jsdom

/** The staff ledger draws what the backend allows, not what the page believes.
 *
 * `staffLedgerRowActions` was the page's own copy of the rule and it drifted
 * twice. It withheld Edit from any payment that had consumed an advance —
 *
 *     ctx.advanceAppliedMinor <= 0 && ...
 *
 * — which is exactly the entry the backend was taught to correct. And it kept
 * returning void-only for a partner-funded salary long after that became
 * correctable, on the strength of a comment saying "Edit would desync the
 * partner leg".
 *
 * Neither drift was caught, correctly: the drift guard compares only the
 * source-keyed half and says so in its docstring. So the copy is gone and the
 * page asks, and these press the buttons rather than reading the source.
 */

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test-support/render-with-query";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  entityPath: (entityId: string, backendPath: string) =>
    `/entities/${entityId}/${backendPath}`,
  ApiError: class extends Error {},
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "emp-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    role: "owner",
    grants: ["operations:write", "daily_transactions:write", "nav:staff"],
    loading: false,
    membershipSettled: true,
    canWriteOperations: true,
    canWriteDailyTransactions: true,
    canReadFinancialReports: true,
    canReadReports: true,
    canAccessSettings: true,
    reload: async () => undefined,
  }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function marker(name: string) {
  return function Marker(props: Record<string, unknown>) {
    if (!props.open) return null;
    return <div data-testid={name} data-value={String(props.voidPath ?? "")} />;
  };
}
vi.mock("@/components/forms/void-subledger-dialog", () => ({
  VoidSubledgerDialog: marker("void-dialog"),
}));
vi.mock("@/components/forms/correct-staff-ledger-form", () => ({
  CorrectStaffLedgerForm: marker("staff-form"),
}));
vi.mock("@/components/forms/correct-partner-funded-salary-form", () => ({
  CorrectPartnerFundedSalaryForm: marker("partner-funded-form"),
}));

import StaffDetailPage from "./page";

const EMPLOYEE = { id: "emp-1", name: "Yasir Khan", pay_currency: "TRY", is_active: true };

/** A payment that consumed an advance: two rows, one journal entry. This is
 * the shape the page's own rule refused to offer Edit on. */
const LEDGER = {
  balance_minor: 0,
  remaining_accrual_minor: 273_000,
  outstanding_advance_minor: 273_000,
  entries: [
    {
      id: "row-pay",
      movement_date: "2026-07-16",
      movement_type: "salary_payment",
      amount_minor: -1_073_000,
      description: "Temmuz maaşı",
      journal_entry_id: "je-pay",
      payment_account_id: "acc-cash",
      display_kind: "effective",
    },
    {
      id: "row-applied",
      movement_date: "2026-07-16",
      movement_type: "advance_applied",
      amount_minor: 273_000,
      description: "Temmuz maaşı — advance applied",
      journal_entry_id: "je-pay",
      payment_account_id: null,
      display_kind: "effective",
    },
  ],
};

function respond(entryActions: Record<string, unknown> | undefined) {
  apiFetch.mockImplementation((path: string) => {
    if (path.endsWith("/ledger")) {
      return Promise.resolve({ ...LEDGER, entry_actions: entryActions });
    }
    if (path.endsWith("/entries/actions")) {
      return Promise.resolve({ actions: entryActions ?? {} });
    }
    return Promise.resolve(EMPLOYEE);
  });
}

const EDITABLE_PAYMENT = {
  can_edit: true,
  can_void: true,
  void_path: "staff/employees/emp-1/ledger/je-pay/void",
  edit: { kind: "staff_ledger", context: {} },
  owner_count: 1,
};

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

async function paymentRow(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByText("Temmuz maaşı")).toBeTruthy());
  const row = screen.getByText("Temmuz maaşı").closest("tr") as HTMLElement;
  await waitFor(() => expect(row.querySelector("button")).toBeTruthy());
  return row;
}

describe("a payment that consumed an advance", () => {
  it("offers Edit when the backend allows it", async () => {
    respond({ "je-pay": EDITABLE_PAYMENT });
    renderWithQuery(<StaffDetailPage />);

    expect((await paymentRow()).textContent).toContain("Edit");
  });

  it("withholds it when the backend does not", async () => {
    // Guard the guard: a page that always drew Edit would satisfy the test
    // above while being just as wrong in the other direction.
    respond({
      "je-pay": { ...EDITABLE_PAYMENT, can_edit: false, edit: null },
    });
    renderWithQuery(<StaffDetailPage />);

    const row = await paymentRow();
    expect(row.textContent).not.toContain("Edit");
    expect(row.textContent).toContain("Void");
  });

  it("voids at the path it was given", async () => {
    // A partner-funded salary voids at its own dual-subledger route, which is
    // why the page must not rebuild this from the employee id.
    respond({
      "je-pay": {
        ...EDITABLE_PAYMENT,
        void_path: "staff/partner-funded-salary/je-pay/void",
      },
    });
    renderWithQuery(<StaffDetailPage />);

    const row = await paymentRow();
    fireEvent.click(
      [...row.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Void",
      )!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /continue to void/i }),
    );

    await waitFor(() => expect(screen.getByTestId("void-dialog")).toBeTruthy());
    expect(screen.getByTestId("void-dialog").dataset.value).toBe(
      "/entities/ent-1/staff/partner-funded-salary/je-pay/void",
    );
  });
});

describe("when the ledger carries the verdicts", () => {
  it("asks for nothing more", async () => {
    respond({ "je-pay": EDITABLE_PAYMENT });
    renderWithQuery(<StaffDetailPage />);

    await paymentRow();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/entries/actions")),
    ).toBe(false);
  });
});
