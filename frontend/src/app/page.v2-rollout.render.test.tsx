// @vitest-environment jsdom

/**
 * v2-only dashboard: greeting without date; no This period; no v1 PageHeader path.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({
    entityId: "ent-1",
    entities: [{ id: "ent-1", name: "Kitchen" }],
    entitiesLoading: false,
    entitiesLoaded: true,
    entitiesError: false,
    refreshEntities: vi.fn(),
    userProfile: { id: "u1", email: "a@b.c", display_name: "Ada" },
  }),
}));

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    canReadFinancialReports: true,
    role: "owner",
    grants: [],
    membershipSettled: true,
    loading: false,
  }),
}));

vi.mock("@/components/onboarding-checklist", () => ({
  OnboardingChecklist: () => null,
}));

vi.mock("@/components/balances/balances-overview", () => ({
  BalancesOverview: () => <div data-testid="fake-balances">Balances</div>,
}));

vi.mock("@/components/dashboard/dashboard-monthly-sales", () => ({
  DashboardMonthlySales: () => (
    <div data-testid="dashboard-monthly-sales">Monthly sales</div>
  ),
}));

vi.mock("@/components/dashboard/dashboard-top-expenses", () => ({
  DashboardTopExpenses: () => (
    <div data-testid="dashboard-top-expenses">Top expenses</div>
  ),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/use-shows-skeleton", () => ({
  useShowsSkeleton: () => false,
}));

vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => false,
}));

import HomePage from "@/app/page";
import { applyVisualTheme, THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceDeclaring } from "@/test-support/source";

function dashPayload() {
  return {
    from_date: "2026-08-01",
    to_date: "2026-08-23",
    net_result_kurus: 0,
    total_expenses_kurus: 0,
    cash_in_hand_kurus: 100_000,
    bank_balance_kurus: 50_000,
    cash_accounts: [],
    sales: {
      cash_sales_kurus: 0,
      pos_card_sales_kurus: 0,
      delivery_sales_kurus: 0,
      group_sales_kurus: 0,
      other_sales_kurus: 0,
      total_sales_kurus: 0,
    },
    delivery_balance_left: [],
    confirmed_invoice_drafts: 0,
  };
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  document.documentElement.removeAttribute("data-theme");
});

beforeEach(() => {
  applyVisualTheme();
  apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes("/dashboard?")) return dashPayload();
    if (String(path).includes("/expense-register")) {
      return { account_totals: [], rows: [], total_kurus: 0, entry_count: 0 };
    }
    if (String(path).includes("/banking/accounts/tree")) {
      return {
        banks: { accounts: [], balance_kurus: 0 },
        cash: { accounts: [], balance_kurus: 0 },
        credit_cards: { accounts: [], balance_kurus: 0 },
        fx: { accounts: [], balance_kurus: 0 },
      };
    }
    return {};
  });
});

describe("v2-only dashboard", () => {
  it("greeting without date; no This period; Cash & bank + monthly sales", async () => {
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      THEME_V2_ATTR,
    );
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-v2-greeting").textContent).toContain(
        "Ada",
      );
    });
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
    expect(screen.queryByText("This period")).toBeNull();
    expect(screen.queryByTestId("report-date-range")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
    expect(screen.getByTestId("cash-bank-snapshot-card")).toBeTruthy();
    expect(screen.getByTestId("fake-balances")).toBeTruthy();
    expect(screen.getByTestId("dashboard-monthly-sales")).toBeTruthy();
    expect(screen.queryByTestId("weekly-chart-period-caption")).toBeNull();
  });

  it("mutation: dashboard old v1 PageHeader path → red; restore → green", () => {
    const page = sourceDeclaring("DashboardHomeContent");
    expect(page).toContain("DashboardV2Header");
    expect(page).toMatch(
      /replaceHeader=\{\s*<DashboardV2Header[\s\S]*?\/>\s*\}/,
    );
    expect(page).toContain('title="Dashboard"');
    expect(page).toContain("replaceHeader");
  });
});
