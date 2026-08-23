// @vitest-environment jsdom

/**
 * Default v2 rollout + as-of dashboard: greeting without date; no This period.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const themeState = { theme: "v2" as "v1" | "v2" };

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
    theme: themeState.theme,
    mounted: true,
    toggle: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/components/onboarding-checklist", () => ({
  OnboardingChecklist: () => null,
}));

vi.mock("@/components/balances/balances-overview", () => ({
  BalancesOverview: () => <div data-testid="fake-right-now">Right now</div>,
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
import { applyVisualTheme, THEME_V2_ATTR } from "@/lib/theme-v2";

function dashPayload() {
  return {
    from_date: "2026-08-01",
    to_date: "2026-08-23",
    net_result_kurus: 0,
    total_expenses_kurus: 0,
    cash_in_hand_kurus: 100_000,
    bank_balance_kurus: 50_000,
    cash_accounts: [],
    sales: { total_sales_kurus: 0 },
    delivery_balance_left: [],
    confirmed_invoice_drafts: 0,
  };
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  themeState.theme = "v2";
  document.documentElement.removeAttribute("data-theme");
});

beforeEach(() => {
  applyVisualTheme("v2");
  apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes("/dashboard?")) return dashPayload();
    if (String(path).includes("/time-series")) return { daily: [] };
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

describe("default v2 dashboard (rollout)", () => {
  it("default v2: greeting without date; no This period; Cash & bank + chart caption", async () => {
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
    expect(screen.getByTestId("cash-bank-snapshot-card")).toBeTruthy();
    expect(screen.getByTestId("fake-right-now")).toBeTruthy();
    expect(screen.getByTestId("weekly-chart-period-caption").textContent).toBe(
      "This month",
    );
  });

  it("explicit v1 choice: PageHeader Dashboard; This period still absent", async () => {
    themeState.theme = "v1";
    applyVisualTheme("v1");
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    });
    expect(screen.queryByTestId("dashboard-v2-greeting")).toBeNull();
    expect(screen.queryByText("This period")).toBeNull();
    expect(screen.getByTestId("cash-bank-snapshot-card")).toBeTruthy();
  });
});
