// @vitest-environment jsdom

/** Group sale form UX polish — rate helper, footer, menu picker, live totals. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fxRateHelperText } from "@/lib/group-sale-form-copy";
import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/use-submit-idempotency", () => ({
  useSubmitIdempotency: () => ({
    resetSubmit: vi.fn(),
    beginSubmit: () => "idem-key",
    completeSubmit: vi.fn(),
  }),
}));
vi.mock("@/lib/use-duplicate-record-submit", () => ({
  useDuplicateRecordSubmit: () => ({
    submitWithDuplicateGuard: async (fn: (ack: boolean) => Promise<unknown>) =>
      fn(false),
    DuplicateRecordDialog: () => null,
  }),
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { GroupSaleForm } = await import("@/components/forms/group-sale-form");

const MENU = {
  id: "menu-veg-1",
  name: "Veg Menu 1",
  price_minor: 1200,
  currency: "USD",
  surcharge_minor: null,
  surcharge_label: null,
  is_active: true,
};

async function selectComboboxById(id: string, query: string, optionLabel: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  const option = await screen.findByRole("option", { name: optionLabel });
  fireEvent.click(option);
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string) => {
    if (url.includes("/group-menus")) return { items: [MENU] };
    if (url.includes("/customers")) return { items: [] };
    return {};
  });
});

afterEach(cleanup);

describe("GroupSaleForm rate + footer copy", () => {
  it("USD with blank sale-date rate shows optional label, forex-only helper, and conversion footer", async () => {
    render(
      <GroupSaleForm open embedded customerId="cust-1" onClose={() => undefined} />,
    );
    await screen.findByLabelText(/Booking currency/);
    await selectComboboxById("group-sale-currency", "USD", "USD");

    expect(screen.getByLabelText(/Sale-date rate \(optional\)/)).toBeTruthy();
    expect(
      screen.getByText(/Leave blank to keep this sale in USD\. No TRY is booked now/),
    ).toBeTruthy();
    expect(screen.getByText(/TRY at FX conversion/)).toBeTruthy();
    expect(screen.queryByText(/booked at/)).toBeNull();
    expect(screen.queryByText(/TRY revenue is booked now/)).toBeNull();
  });

  it("USD with rate 35,00 and line 10 × 12,00 shows live totals and booked footer", async () => {
    render(
      <GroupSaleForm open embedded customerId="cust-1" onClose={() => undefined} />,
    );
    await screen.findByLabelText(/Booking currency/);
    await selectComboboxById("group-sale-currency", "USD", "USD");

    fireEvent.change(screen.getByLabelText(/Sale-date rate \(optional\)/), {
      target: { value: "35,00" },
    });
    expect(screen.getByText(/TRY revenue is booked now at this rate\./)).toBeTruthy();

    const pax = screen.getByPlaceholderText("e.g. 10");
    fireEvent.change(pax, { target: { value: "10" } });

    const lineRate = screen.getByPlaceholderText("e.g. 12,00");
    fireEvent.change(lineRate, { target: { value: "12,00" } });

    await waitFor(() => {
      const footer = screen.getByText(/Total \(USD\):/).closest("p");
      expect(footer?.textContent).toMatch(/\$120\.00/);
    });

    const footer = screen.getByText(/Total \(USD\):/).closest("p");
    expect(footer?.textContent).toMatch(/Total \(USD\):.*\$120\.00/);
    expect(footer?.textContent).toMatch(/≈ 4\.200,00 ₺ booked at 35,00/);
  });

  it("TRY booking hides sale-date rate and uses ₺ labels", async () => {
    render(
      <GroupSaleForm open embedded customerId="cust-1" onClose={() => undefined} />,
    );
    await screen.findByLabelText(/Booking currency/);

    expect(screen.queryByLabelText(/Sale-date rate/)).toBeNull();
    expect(screen.getByText("Rate / person (₺)")).toBeTruthy();
    expect(screen.getByText("Total (₺):")).toBeTruthy();
  });
});

describe("GroupSaleForm menu picker", () => {
  it("renders exactly one menu control per line — no duplicate name field", async () => {
    render(
      <GroupSaleForm open embedded customerId="cust-1" onClose={() => undefined} />,
    );
    await screen.findByText("Menu lines");

    expect(screen.getAllByPlaceholderText("Type or pick…")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("Menu name")).toBeNull();

    await selectComboboxById("group-sale-currency", "USD", "USD");
    const menuInput = screen.getByPlaceholderText("Type or pick…");
    fireEvent.focus(menuInput);
    fireEvent.change(menuInput, { target: { value: "Veg" } });
    const option = await screen.findByRole("option", { name: "Veg Menu 1" });
    fireEvent.click(option);

    await waitFor(() => {
      expect((menuInput as HTMLInputElement).value).toBe("Veg Menu 1");
    });
    expect(screen.getAllByPlaceholderText("Type or pick…")).toHaveLength(1);
  });
});

const CORRECTING_SALE = {
  id: "sale-correct-1",
  customer_id: "cust-1",
  sale_date: "2026-08-01",
  description: "Group sale",
  currency: "TRY",
  status: "posted",
  total_kurus: 120_000,
  forex_currency: null,
  total_forex_minor: null,
  fx_rate_used: null,
  journal_entry_id: "je-1",
  customer_ledger_entry_id: "cle-1",
  amends_group_sale_id: null,
  amended_by_group_sale_id: null,
  actor_id: null,
  created_at: "2026-08-01T12:00:00Z",
  lines: [
    {
      id: "line-1",
      group_menu_id: "menu-veg-1",
      menu_name_snapshot: "Veg Menu 1",
      pax: 10,
      rate_per_person_minor: 12_000,
      line_total_minor: 120_000,
      line_total_kurus: 120_000,
    },
  ],
  remaining_kurus: 120_000,
  remaining_forex_minor: null,
  discounts: [],
};

describe("GroupSaleForm note field", () => {
  it("shows Note (optional), starts empty, and exposes the placeholder", async () => {
    render(
      <GroupSaleForm open embedded customerId="cust-1" onClose={() => undefined} />,
    );
    await screen.findByLabelText(/Booking currency/);

    const note = screen.getByLabelText("Note (optional)") as HTMLInputElement;
    expect(note.value).toBe("");
    expect(note.placeholder).toMatch(/deposit paid/);
    expect(screen.queryByLabelText(/^Description$/)).toBeNull();
  });

  it("edit reopen: saved default Group sale → note field empty; real note → shown", async () => {
    const { rerender } = render(
      <GroupSaleForm
        open
        embedded
        customerId="cust-1"
        correcting={CORRECTING_SALE}
        onClose={() => undefined}
      />,
    );
    await screen.findByLabelText("Note (optional)");
    expect((screen.getByLabelText("Note (optional)") as HTMLInputElement).value).toBe("");

    rerender(
      <GroupSaleForm
        open
        embedded
        customerId="cust-1"
        correcting={{ ...CORRECTING_SALE, description: "deposit paid" }}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect((screen.getByLabelText("Note (optional)") as HTMLInputElement).value).toBe(
        "deposit paid",
      );
    });
  });

  it("mutation: pre-filling Group sale in the form source fails the guard", () => {
    const form = sourceDeclaring("GroupSaleFormFooter");
    const hook = sourceDeclaring("useGroupSaleForm");
    expect(form).toContain("Note (optional)");
    expect(hook).not.toMatch(/useState\("Group sale"\)/);
    expect(hook).not.toMatch(/setDescription\("Group sale"\)/);
    const broken = hook.replace('useState("")', 'useState("Group sale")');
    expect(broken).toMatch(/useState\("Group sale"\)/);
  });
});

describe("group-sale-form-copy mutation guard", () => {
  it("forex-only helper is not the legacy single-path wording", () => {
    expect(fxRateHelperText("USD", false)).toContain("Leave blank to keep this sale in USD");
    expect(fxRateHelperText("USD", false)).not.toContain(
      "Objective rate for this sale date",
    );
  });

  it("mutation: hardcoding legacy helper text in the copy module would fail", () => {
    const src = sourceDeclaring("fxRateHelperText");
    const fnStart = src.indexOf("export function fxRateHelperText");
    const fnEnd = src.indexOf("export const FX_FOOTER_AT_CONVERSION");
    const fnBlock = src.slice(fnStart, fnEnd);
    expect(fnBlock).toContain("Leave blank to keep this sale in");
    expect(fnBlock).not.toContain("Objective rate for this sale date");
    expect(fxRateHelperText("USD", false)).not.toContain(
      "Objective rate for this sale date",
    );
  });
});
