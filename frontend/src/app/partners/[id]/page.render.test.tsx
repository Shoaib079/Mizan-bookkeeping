// @vitest-environment jsdom

/** What the partner ledger offers on each row, pressed rather than read.
 *
 * The owner: "i do not see any action button edit or void on partner page".
 * Three separate faults were behind that question and none of them could be
 * caught by reading source, because each is a disagreement between what the
 * backend answers and what the page then does with it:
 *
 *  1. A row whose entry covers several partners drew an empty cell, which
 *     reads as broken rather than as a rule. It now says "Shared".
 *  2. The page ignored `edit.kind`. On a single-partner book a profit
 *     allocation is not shared, so it drew an Edit that opened the
 *     partner-ledger form and failed with "must be voided at entity level".
 *  3. The page rebuilt the void path from the partner id instead of using the
 *     one it was given, so voiding an allocation aimed at the wrong route.
 *
 * The dialogs are markers. What is asserted is which one opened and with what
 * path — the forms' own behaviour is theirs and is tested where they live.
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
  useParams: () => ({ id: "p1" }),
  // `DataTableRow` reaches for it to make a row clickable when given an href.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** Every dialog becomes a marker carrying the prop that identifies it.
 *
 * A named function expression, not an arrow: the build lints test files too,
 * and `react/display-name` fails an anonymous component. Same shape as
 * `gl-entry-actions.render.test.tsx`, which had this settled already.
 */
function marker(name: string, prop: string) {
  return function Marker(props: Record<string, unknown>) {
    if (!props.open) return null;
    const value = props[prop];
    return (
      <div
        data-testid={name}
        data-value={
          value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "")
        }
      />
    );
  };
}
vi.mock("@/components/forms/partner-form", () => ({
  PartnerForm: marker("partner-form", "open"),
}));
vi.mock("@/components/forms/partner-record-form", () => ({
  PartnerRecordForm: marker("record-form", "lockedKind"),
}));
vi.mock("@/components/forms/correct-partner-ledger-form", () => ({
  CorrectPartnerLedgerForm: marker("correct-form", "partnerId"),
}));
vi.mock("@/components/forms/void-subledger-dialog", () => ({
  VoidSubledgerDialog: marker("void-dialog", "voidPath"),
}));
vi.mock("@/components/forms/correct-partner-profit-allocation-form", () => ({
  CorrectPartnerProfitAllocationForm: marker("allocation-form", "entry"),
}));
vi.mock("@/components/forms/correct-partner-funded-salary-form", () => ({
  CorrectPartnerFundedSalaryForm: marker("salary-form", "entry"),
}));

import PartnerDetailPage from "./page";

const PARTNER = { id: "p1", name: "Canan Takan", is_active: true };

function entry(over: Record<string, unknown>) {
  return {
    id: "row-x",
    movement_date: "2026-08-10",
    movement_type: "drawing",
    amount_kurus: -8_080_000,
    description: "Cashier sent it",
    journal_entry_id: "je-drawing",
    payment_account_id: "acc-1",
    display_kind: "effective",
    running_balance_kurus: -8_080_000,
    ...over,
  };
}

/** One drawing, and one allocation row that is *not* shared — a single-partner
 * book, which is the case the owner_count guard never covered. */
const LEDGER = {
  balance_kurus: 0,
  capital_balance_kurus: 0,
  capital_contribution_kurus: 0,
  profit_allocated_kurus: 7_500_000,
  drawings_net_kurus: -8_080_000,
  net_balance_kurus: -8_080_000,
  current_account_kurus: -1_203_609,
  entries: [
    entry({}),
    entry({
      id: "row-alloc",
      movement_type: "profit_allocation",
      journal_entry_id: "je-alloc",
      amount_kurus: 6_876_391,
      description: "Partner profit allocation",
      movement_date: "2026-08-03",
    }),
    entry({
      id: "row-salary",
      movement_type: "salary_fronted",
      journal_entry_id: "je-salary",
      amount_kurus: 3_250_000,
      description: "Temmuz maaşı",
      subject_name: "Ahmet Yılmaz",
      movement_date: "2026-08-05",
    }),
  ],
};

function respond(actions: Record<string, unknown>) {
  apiFetch.mockImplementation((path: string) => {
    if (path.endsWith("/ledger")) return Promise.resolve(LEDGER);
    if (path.endsWith("/entries/actions")) return Promise.resolve({ actions });
    return Promise.resolve(PARTNER);
  });
}

const DRAWING_ALLOWED = {
  can_edit: true,
  can_void: true,
  void_path: "partners/p1/ledger/je-drawing/void",
  edit: { kind: "partner_ledger", context: {} },
  owner_count: 1,
};

/** What the backend really returns for an allocation on a one-partner book:
 * editable, voidable, and *not* shared. The kind is the only thing saying the
 * partner page cannot open it. */
const ALLOCATION_ALONE = {
  can_edit: true,
  can_void: true,
  void_path: "partners/profit-allocation/je-alloc/void",
  edit: { kind: "partner_profit_allocation", context: {} },
  owner_count: 1,
};

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

function rowNamed(text: string): HTMLElement {
  return screen.getByText(text).closest("tr") as HTMLElement;
}

/** The row, once its verdict has arrived.
 *
 * Rows render before the actions lookup answers — deliberately, so the ledger
 * is readable immediately. Asserting on the cell before then would pass
 * against a page that never draws anything.
 */
async function settledRow(text: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
  await waitFor(() =>
    expect(
      apiFetch.mock.calls.some((call) =>
        String(call[0]).endsWith("/entries/actions"),
      ),
    ).toBe(true),
  );
  const row = rowNamed(text);
  await waitFor(() =>
    expect(
      row.querySelector("button") !== null || /Shared/.test(row.textContent ?? ""),
    ).toBe(true),
  );
  return row;
}

function voidButton(row: HTMLElement): HTMLElement {
  const found = [...row.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === "Void",
  );
  if (!found) throw new Error(`no Void button in row: ${row.textContent}`);
  return found;
}

/** Void, then the "this cannot be undone" step in front of it.
 *
 * Two clicks on purpose — the confirm is deliberate and skipping it here
 * would test a path no owner can reach.
 */
async function pressVoid(row: HTMLElement): Promise<void> {
  fireEvent.click(voidButton(row));
  const confirm = await screen.findByRole("button", { name: /continue to void/i });
  fireEvent.click(confirm);
}

describe("a row this page can correct", () => {
  it("offers both buttons", async () => {
    respond({ "je-drawing": DRAWING_ALLOWED });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Cashier sent it");
    expect(row.textContent).toContain("Edit");
    expect(voidButton(row)).toBeTruthy();
  });

  // Named for what it checks and no more. For a drawing the path the page
  // used to rebuild and the path the backend returns are the same string, so
  // this cannot tell them apart — it holds down that Void opens at all. The
  // allocation case below is the one that discriminates.
  it("opens the void dialog at the path it reports", async () => {
    respond({ "je-drawing": DRAWING_ALLOWED });
    renderWithQuery(<PartnerDetailPage />);

    await pressVoid(await settledRow("Cashier sent it"));

    await waitFor(() => expect(screen.getByTestId("void-dialog")).toBeTruthy());
    expect(screen.getByTestId("void-dialog").dataset.value).toBe(
      "/entities/ent-1/partners/p1/ledger/je-drawing/void",
    );
  });
});

describe("an allocation on a single-partner book", () => {
  // Not shared, so nothing upstream hides it. What it may offer is decided
  // entirely by the kind the backend names.
  it("does not offer an Edit for a kind this page has no form for", async () => {
    // The rule, with the allocation no longer standing for it: the page draws
    // Edit only where it can open what the backend named. It used to open its
    // own form regardless, which is how an allocation came to fail on submit
    // rather than on sight. A kind belonging to another subledger stands in
    // here because it is the one case that can never be wired away.
    respond({
      "je-alloc": {
        ...ALLOCATION_ALONE,
        edit: { kind: "staff_ledger", context: {} },
      },
    });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Partner profit allocation");
    expect(row.textContent).not.toContain("Edit");
    // Void is unaffected — withholding one must not withhold the other.
    expect(voidButton(row)).toBeTruthy();
  });

  it("still offers Void, at the allocation's own route", async () => {
    respond({ "je-alloc": ALLOCATION_ALONE });
    renderWithQuery(<PartnerDetailPage />);

    await pressVoid(await settledRow("Partner profit allocation"));

    await waitFor(() => expect(screen.getByTestId("void-dialog")).toBeTruthy());
    expect(screen.getByTestId("void-dialog").dataset.value).toBe(
      "/entities/ent-1/partners/profit-allocation/je-alloc/void",
    );
  });
});

describe("a row shared by several partners", () => {
  it("says so instead of leaving the cell blank", async () => {
    respond({ "je-alloc": { ...ALLOCATION_ALONE, owner_count: 3 } });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Partner profit allocation");
    expect(row.textContent).toContain("Shared");
    expect(row.textContent).not.toContain("Void");
  });
});

describe("when the actions lookup fails", () => {
  it("warns, rather than showing a ledger that merely looks broken", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/entries/actions")) return Promise.reject(new Error("500"));
      if (path.endsWith("/ledger")) return Promise.resolve(LEDGER);
      return Promise.resolve(PARTNER);
    });
    renderWithQuery(<PartnerDetailPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Edit and Void are");
    // The rows are still right, which is the part the wording promises.
    expect(rowNamed("Cashier sent it")).toBeTruthy();
  });
});

describe("a salary the partner fronted", () => {
  it("names the employee it was paid for", async () => {
    // Three salaries in a week all read "Temmuz maaşı" until the reference the
    // row has always carried was read back.
    respond({});
    renderWithQuery(<PartnerDetailPage />);

    await waitFor(() => expect(screen.getByText("Temmuz maaşı")).toBeTruthy());
    const row = rowNamed("Temmuz maaşı");
    expect(row.textContent).toContain("Ahmet Yılmaz");
  });
});

describe("when the ledger already carries the verdicts", () => {
  it("draws the buttons without a second request", async () => {
    // The owner: "the action buttons load after the page loads". They did,
    // because the page asked separately for work the ledger had already done.
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/ledger")) {
        return Promise.resolve({
          ...LEDGER,
          entry_actions: { "je-drawing": DRAWING_ALLOWED },
        });
      }
      return Promise.resolve(PARTNER);
    });

    renderWithQuery(<PartnerDetailPage />);

    await waitFor(() =>
      expect(rowNamed("Cashier sent it").textContent).toContain("Edit"),
    );
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/entries/actions")),
    ).toBe(false);
  });
});

describe("editing a profit allocation that covers one partner", () => {
  it("opens the allocation form, not the partner-ledger one", async () => {
    // The two forms post to different routes. Opening the wrong one is how
    // this Edit used to fail on submit rather than on sight.
    respond({ "je-alloc": ALLOCATION_ALONE });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Partner profit allocation");
    fireEvent.click(
      [...row.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Edit",
      )!,
    );

    await waitFor(() => expect(screen.getByTestId("allocation-form")).toBeTruthy());
    expect(screen.queryByTestId("correct-form")).toBeNull();
  });

  it("hands it the figures the backend sent, not the row's own", async () => {
    // An allocation row carries this partner's slice; the form edits the whole
    // allocation. Filling it from the row would quietly shrink the total.
    respond({
      "je-alloc": {
        ...ALLOCATION_ALONE,
        edit: {
          kind: "partner_profit_allocation",
          context: {
            allocation_date: "2026-08-03",
            description: "Partner profit allocation",
            profit_kurus: 7_500_000,
          },
        },
      },
    });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Partner profit allocation");
    fireEvent.click(
      [...row.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Edit",
      )!,
    );

    const form = await screen.findByTestId("allocation-form");
    const entry = JSON.parse(form.dataset.value!);
    expect(entry.profit_kurus).toBe(7_500_000);
    expect(entry.journal_entry_id).toBe("je-alloc");
  });
});

describe("editing a salary the partner paid from pocket", () => {
  it("opens the form that moves both subledgers, not the partner-ledger one", async () => {
    // One journal entry writes the staff rows and the partner row. Correcting
    // it through the partner-ledger route would rewrite the partner leg and
    // leave the staff rows describing a payment that no longer exists — which
    // is why this was void-only until a real correction was built for it.
    respond({
      "je-salary": {
        can_edit: true,
        can_void: true,
        void_path: "staff/partner-funded-salary/je-salary/void",
        edit: {
          kind: "partner_funded_salary",
          context: {
            partner_id: "p1",
            movement_date: "2026-08-05",
            description: "Temmuz maaşı",
            amount_kurus: 3_250_000,
          },
        },
        owner_count: 1,
      },
    });
    renderWithQuery(<PartnerDetailPage />);

    const row = await settledRow("Temmuz maaşı");
    fireEvent.click(
      [...row.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Edit",
      )!,
    );

    const form = await screen.findByTestId("salary-form");
    expect(screen.queryByTestId("correct-form")).toBeNull();
    expect(JSON.parse(form.dataset.value!).amount_kurus).toBe(3_250_000);
  });

  it("voids through the dual-subledger route", async () => {
    // Never the partner-ledger void: reversing one leg alone is the fault the
    // dual void exists to prevent.
    respond({
      "je-salary": {
        can_edit: true,
        can_void: true,
        void_path: "staff/partner-funded-salary/je-salary/void",
        edit: { kind: "partner_funded_salary", context: {} },
        owner_count: 1,
      },
    });
    renderWithQuery(<PartnerDetailPage />);

    await pressVoid(await settledRow("Temmuz maaşı"));

    await waitFor(() => expect(screen.getByTestId("void-dialog")).toBeTruthy());
    expect(screen.getByTestId("void-dialog").dataset.value).toBe(
      "/entities/ent-1/staff/partner-funded-salary/je-salary/void",
    );
  });
});
