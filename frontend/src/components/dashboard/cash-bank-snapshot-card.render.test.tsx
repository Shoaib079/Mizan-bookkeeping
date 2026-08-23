// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
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

afterEach(cleanup);

describe("CashBankSnapshotCard", () => {
  it("desktop: cash + banks side-by-side with compact total and both subtotals", async () => {
    render(
      <CashBankSnapshotCard
        cashKurus={140_000}
        bankKurus={25_000}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 100_000 },
          { id: "c2", name: "Bar Drawer", balance_kurus: 40_000 },
        ]}
      />,
    );

    const columns = screen.getByTestId("cash-bank-columns");
    expect(columns.className).toContain("sm:grid-cols-2");
    expect(columns.className).toContain("grid-cols-1");

    const total = screen.getByTestId("cash-bank-total");
    expect(total.textContent).toContain("Total cash & bank");
    expect(total.textContent).toContain("·");
    expect(total.textContent).toContain("1.650,00 ₺");

    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(2);
    expect(screen.getByText("Cash drawers")).toBeTruthy();
    expect(screen.getByText("Bank accounts")).toBeTruthy();
    expect(screen.getByTestId("cash-group").textContent).toMatch(/Cash/);
    expect(screen.getByTestId("bank-group").textContent).toMatch(/Banks/);

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("mobile card: stacks on narrow (grid-cols-1) and two columns from sm", () => {
    render(
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

  it("mutation: collapse to single column always → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("sm:grid-cols-2");
    expect(src).toContain("cash-bank-columns");
    // Must keep a two-column breakpoint — always one column fails.
    expect(src).not.toMatch(
      /cash-bank-columns[\s\S]{0,120}className="[^"]*grid-cols-1(?![^"]*sm:grid-cols-2)/,
    );
  });
});
