// @vitest-environment jsdom

/**
 * Dashboard Apply must refetch with the new range and update This period.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  BalancesOverview: () => null,
}));

vi.mock("@/components/dashboard/weekly-chart", () => ({
  WeeklyChart: () => null,
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

function dashPayload(net: number, sales: number, expenses: number) {
  return {
    from_date: "2026-08-01",
    to_date: "2026-08-23",
    net_result_kurus: net,
    total_expenses_kurus: expenses,
    cash_in_hand_kurus: 100_000,
    bank_balance_kurus: 50_000,
    cash_accounts: [],
    sales: { total_sales_kurus: sales },
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
      return dashPayload(1_000_000, 2_000_000, 1_000_000);
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

describe("dashboard date Apply", () => {
  it("Apply with a new range refetches dashboard and updates This period net", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("This period")).toBeTruthy();
    });

    await waitFor(() => {
      const figure = document.querySelector('[data-stat-figure="true"]');
      expect(figure?.textContent).toContain("10.000,00");
    });

    const desktop = screen.getByTestId("report-date-range-desktop");
    const fromInput = within(desktop).getByLabelText("From");
    const toInput = within(desktop).getByLabelText("To");
    fireEvent.change(fromInput, { target: { value: "01.07.2026" } });
    fireEvent.change(toInput, { target: { value: "31.07.2026" } });

    apiFetch.mockImplementation(async (path: string) => {
      const p = String(path);
      if (p.includes("/dashboard?")) {
        expect(p).toContain("from=2026-07-01");
        expect(p).toContain("to=2026-07-31");
        return dashPayload(9_900_000, 12_000_000, 2_100_000);
      }
      if (p.includes("/time-series")) return { daily: [] };
      if (p.includes("/banking/accounts/tree")) return emptyTree;
      return {};
    });

    fireEvent.click(within(desktop).getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const dashCalls = apiFetch.mock.calls.filter((c) =>
        String(c[0]).includes("/dashboard?from=2026-07-01"),
      );
      expect(dashCalls.length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      const figure = document.querySelector('[data-stat-figure="true"]');
      expect(figure?.textContent).toContain("99.000,00");
    });
  });
});
