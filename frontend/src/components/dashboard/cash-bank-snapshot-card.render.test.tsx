// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => ({
    banks: {
      accounts: [
        {
          id: "bank-1",
          name: "Garanti",
          account_kind: "bank",
          balance_kurus: 25_000,
          is_active: true,
          bank_name: "Garanti",
          last_four: null,
        },
      ],
      balance_kurus: 25_000,
    },
    cash: { accounts: [], balance_kurus: 0 },
    credit_cards: { accounts: [], balance_kurus: 0 },
    fx: { accounts: [], balance_kurus: 0 },
  })),
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

function renderCard(
  ui: React.ReactElement,
  { themeV2 = false }: { themeV2?: boolean } = {},
) {
  if (!themeV2) return render(ui);
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}

function expectSharedCashBankCard() {
  const total = screen.getByTestId("cash-bank-total");
  expect(total.className).toContain("w-full");
  expect(screen.getByTestId("cash-bank-total-label").textContent).toBe(
    "Total balance",
  );
  expect(screen.getByTestId("cash-bank-as-of-hint").textContent).toBe(
    "as of today",
  );
  const figure = screen.getByTestId("cash-bank-total-figure");
  expect(figure.className).toContain("w-full");
  expect(figure.className).toContain("text-[20px]");
  expect(figure.className).toContain("font-extrabold");
  expect(figure.className).not.toContain("truncate");
  expect(figure.className).not.toMatch(/\bellipsis\b/);

  // Two-row total: figure is NOT on the heading row / right of title.
  const heading = screen.getByTestId("cash-bank-heading");
  expect(heading.contains(figure)).toBe(false);
  expect(heading.textContent).not.toMatch(/₺/);

  expect(screen.queryByTestId("cash-bank-column-divider")).toBeNull();
  expect(screen.queryByTestId("cash-bank-stack-divider")).toBeNull();

  for (const label of screen.getAllByTestId("cash-bank-subtotal-label")) {
    expect(label.className).toContain("text-muted-foreground");
    expect(label.className).not.toContain("font-bold");
  }

  const columns = screen.getByTestId("cash-bank-columns");
  expect(columns.className).toContain("sm:grid-cols-2");
  expect(columns.className).not.toContain("sm:gap-x-6");
  expect(columns.className).not.toContain(
    "sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]",
  );
}

describe("CashBankSnapshotCard", () => {
  it("v1: two-row total, divider absent, muted Cash/Banks, as of today", async () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={140_000}
        bankKurus={25_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
          { id: "c2", name: "Bar Drawer", balance_kurus: 40_000 },
        ]}
      />,
    );

    expectSharedCashBankCard();
    expect(screen.getByTestId("cash-bank-total-figure").textContent).toContain(
      "1.650,00 ₺",
    );
    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(2);
    expect(screen.getByTestId("cash-bank-heading").className).toContain(
      "font-medium",
    );
    expect(screen.getByTestId("cash-bank-heading").className).toContain(
      "text-foreground",
    );

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("v2 wrapper: identical shared card — two-row total; no inline total; no v2-only divider/bold", async () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={140_000}
        bankKurus={25_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
          { id: "c2", name: "Bar Drawer", balance_kurus: 40_000 },
        ]}
      />,
      { themeV2: true },
    );

    expectSharedCashBankCard();
    expect(screen.getByTestId("cash-bank-total-figure").textContent).toContain(
      "1.650,00 ₺",
    );

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("mobile card: stacks on narrow (grid-cols-1) and two columns from sm", () => {
    renderCard(
      <CashBankSnapshotCard
        cashKurus={50_000}
        bankKurus={0}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 50_000 },
        ]}
      />,
    );

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toMatch(/grid-cols-1/);
    expect(columns.className).toMatch(/sm:grid-cols-2/);
    expect(screen.getByTestId("cash-bank-total")).toBeTruthy();
    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(1);
  });

  it("mutation: v2 renders the inline truncated total → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-bank-total-label");
    expect(src).toContain("Total balance");
    expect(src).toContain("cash-bank-total-figure");
    expect(src).toContain("as of today");
    expect(src).toContain("text-[20px]");
    expect(src).toContain("font-extrabold");
    expect(src).not.toMatch(
      /cash-bank-heading[\s\S]{0,400}cash-bank-total[\s\S]{0,200}truncate/,
    );
    expect(src).not.toMatch(
      /cash-bank-total-figure[\s\S]{0,120}truncate/,
    );
    expect(src).not.toContain("Total cash & bank");
    // No theme fork that could resurrect an inline total under v2.
    expect(src).not.toContain("useNewLookTheme");
    expect(src).not.toContain("SUBTOTAL_LABEL_V2");
    expect(src).not.toContain("THEME_V2_ATTR");
  });

  it("mutation: v2 drops divider / as of today → red (parity: no v2-only chrome)", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("as of today");
    expect(src).toContain("cash-bank-as-of-hint");
    // Dividers were v2-only polish — must stay deleted (identical to v1).
    expect(src).not.toContain("cash-bank-column-divider");
    expect(src).not.toContain("cash-bank-stack-divider");
    expect(src).not.toContain("sm:gap-x-6");
    expect(src).not.toContain("SUBTOTAL_LABEL_V2");
    expect(src).toContain("sm:grid-cols-2");
    expect(src).toContain("text-muted-foreground");
    expect(src).toContain("cash-bank-heading");
    expect(src).toContain("font-medium text-foreground");
  });

  it("mutation: collapse to single column always → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("sm:grid-cols-2");
    expect(src).toContain("cash-bank-columns");
    expect(src).not.toMatch(
      /cash-bank-columns[\s\S]{0,120}className="[^"]*grid-cols-1(?![^"]*sm:grid-cols-2)/,
    );
  });

  it("HomePage mounts one shared CashBankSnapshotCard for both themes", () => {
    const page = sourceDeclaring("HomePage");
    expect(page).toContain("CashBankSnapshotCard");
    expect(page).toContain('data-layout="as-of-cash"');
    expect(page).not.toContain("v2-cash-bank-only");
    expect(page).not.toContain('label="This period"');
    // No alternate v2 snapshot component.
    expect(page).not.toMatch(/CashBank.*V2|V2CashBank/);
  });
});
