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
  it("renders each drawer row, cash/bank subtotals, and combined headline", async () => {
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

    expect(screen.getByText("Total cash & bank")).toBeTruthy();
    expect(screen.getByText("1.650,00 ₺")).toBeTruthy(); // 165000 combined

    const drawerRows = screen.getAllByTestId("cash-drawer-row");
    expect(drawerRows).toHaveLength(2);
    expect(screen.getByText("Main Drawer")).toBeTruthy();
    expect(screen.getByText("Bar Drawer")).toBeTruthy();
    expect(screen.getByText("1.000,00 ₺")).toBeTruthy();
    expect(screen.getByText("400,00 ₺")).toBeTruthy();

    expect(screen.getByTestId("cash-group").textContent).toContain("Cash");
    expect(screen.getByTestId("bank-group").textContent).toContain("Banks");

    await waitFor(() => {
      expect(screen.getByText("Garanti")).toBeTruthy();
    });
  });

  it("single-drawer entity still renders cleanly (no empty cash group)", () => {
    render(
      <CashBankSnapshotCard
        cashKurus={50_000}
        bankKurus={0}
        cashAccounts={[
          { id: "c1", name: "Main Drawer", balance_kurus: 50_000 },
        ]}
      />,
    );

    expect(screen.getAllByTestId("cash-drawer-row")).toHaveLength(1);
    expect(screen.getByText("Main Drawer")).toBeTruthy();
    expect(screen.queryByText(/No cash drawers yet/)).toBeNull();
    expect(screen.getByText("Total cash & bank")).toBeTruthy();
  });

  it("mutation: collapse cash to one aggregate row when >1 drawer → red", () => {
    const src = sourceDeclaring("CashBankSnapshotCard");
    expect(src).toContain("cash-drawer-row");
    expect(src).toContain("cashAccounts.map");
    // Must map each drawer — a single aggregate Cash line without rows fails.
    expect(src).not.toMatch(
      /cashAccounts\.length\s*>\s*1[\s\S]{0,120}formatTry\(cashKurus\)/,
    );
  });
});
