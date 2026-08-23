// @vitest-environment jsdom

/**
 * Dashboard is as-of-only: no Apply/range UI; Cash & bank + chart MTD caption.
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

vi.mock("@/components/quick-actions", () => ({
  useQuickActions: () => ({ deliveryEnabled: false }),
}));

vi.mock("@/components/layout/new-look-toggle", () => ({
  useNewLookTheme: () => ({
    theme: "v1",
    mounted: true,
    toggle: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/components/onboarding-checklist", () => ({
  OnboardingChecklist: () => null,
}));

vi.mock("@/components/balances/balances-overview", () => ({
  BalancesOverview: () => (
    <div data-testid="fake-right-now">Right now</div>
  ),
}));

vi.mock("@/components/dashboard/weekly-chart", () => ({
  WeeklyChart: () => (
    <div>
      <p data-testid="weekly-chart-period-caption">This month</p>
    </div>
  ),
  chartStatusForRefresh: "loading" as const,
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

function dashPayload() {
  return {
    from_date: "2026-08-01",
    to_date: "2026-08-23",
    net_result_kurus: 1_000_000,
    total_expenses_kurus: 500_000,
    cash_in_hand_kurus: 100_000,
    bank_balance_kurus: 50_000,
    cash_accounts: [],
    sales: { total_sales_kurus: 2_000_000 },
    delivery_balance_left: [],
    confirmed_invoice_drafts: 0,
  };
}

const emptyTree = {
  banks: { accounts: [], balance_kurus: 0 },
  cash: { accounts: [], balance_kurus: 0 },
  credit_cards: { accounts: [], balance_kurus: 0 },
  fx: { accounts: [], balance_kurus: 0 },
};

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

beforeEach(() => {
  apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes("/dashboard?")) {
      return dashPayload();
    }
    if (String(path).includes("/time-series")) {
      return { daily: [] };
    }
    if (String(path).includes("/banking/accounts/tree")) {
      return emptyTree;
    }
    return {};
  });
});

describe("dashboard as-of home", () => {
  it("v1: Cash & bank present; This period and range controls ABSENT; chart caption", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("cash-bank-snapshot-card")).toBeTruthy();
    });

    expect(screen.queryByText("This period")).toBeNull();
    expect(screen.queryByTestId("report-date-range")).toBeNull();
    expect(screen.queryByTestId("report-period-chip")).toBeNull();
    expect(screen.getByTestId("dashboard-kpi-row").getAttribute("data-layout")).toBe(
      "as-of-cash",
    );
    expect(screen.getByTestId("fake-right-now")).toBeTruthy();
    expect(screen.getByTestId("weekly-chart-period-caption").textContent).toBe(
      "This month",
    );

    await waitFor(() => {
      expect(apiFetch.mock.calls.some((c) => String(c[0]).includes("/dashboard?"))).toBe(
        true,
      );
    });
  });
});
