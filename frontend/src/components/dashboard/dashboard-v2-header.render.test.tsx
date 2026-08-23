// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-shows-skeleton", () => ({
  useShowsSkeleton: () => false,
}));

import { DashboardV2Header } from "@/components/dashboard/dashboard-v2-header";
import { OverviewPage } from "@/components/page/overview-page";
import { ThemeV2Only } from "@/components/ui/theme-v2-gate";
import { THEME_V2_ATTR } from "@/lib/theme-v2";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const fixedNow = new Date(2026, 7, 23, 14, 30, 0); // afternoon local

function renderV2Header(ui: React.ReactElement) {
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}

describe("DashboardV2Header", () => {
  it("all breakpoints: greeting + name left; today right same line; restaurant ABSENT", () => {
    renderV2Header(
      <DashboardV2Header
        displayName="Ada Yılmaz"
        now={fixedNow}
        periodDesktop={<div data-testid="fake-period-desktop">From / To</div>}
        periodMobile={<div data-testid="fake-period-mobile">chip</div>}
      />,
    );

    const greeting = screen.getByTestId("dashboard-v2-greeting");
    expect(greeting.textContent).toBe("Good afternoon, Ada Yılmaz");

    const today = screen.getByTestId("dashboard-v2-today");
    expect(today.textContent).toBe("23.08.2026");
    expect(today.className).toContain("text-[13px]");
    expect(today.className).toContain("text-[#3D4A63]");

    const row = screen.getByTestId("dashboard-v2-header-row");
    expect(row.className).toContain("justify-between");
    expect(row.contains(greeting)).toBe(true);
    expect(row.contains(today)).toBe(true);

    expect(screen.queryByTestId("dashboard-v2-restaurant-chip")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-restaurant-dot")).toBeNull();
    expect(screen.queryByText("Mizan Kitchen")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it(">=sm: range in right cluster; <sm: compact chip below header row", () => {
    renderV2Header(
      <DashboardV2Header
        displayName="Ada"
        now={fixedNow}
        periodDesktop={<div data-testid="fake-period-desktop">fields</div>}
        periodMobile={<div data-testid="fake-period-mobile">chip</div>}
      />,
    );

    const right = screen.getByTestId("dashboard-v2-right");
    const desktop = screen.getByTestId("dashboard-v2-period-desktop");
    const mobile = screen.getByTestId("dashboard-v2-period-mobile");

    expect(right.contains(screen.getByTestId("dashboard-v2-today"))).toBe(
      true,
    );
    expect(right.contains(desktop)).toBe(true);
    expect(desktop.className).toContain("hidden");
    expect(desktop.className).toContain("sm:block");
    expect(screen.getByTestId("fake-period-desktop")).toBeTruthy();

    expect(mobile.className).toContain("sm:hidden");
    expect(screen.getByTestId("dashboard-v2-header").contains(mobile)).toBe(
      true,
    );
    expect(screen.getByTestId("dashboard-v2-header-row").contains(mobile)).toBe(
      false,
    );
    expect(screen.getByTestId("fake-period-mobile")).toBeTruthy();
  });

  it("v2: greeting without name omits the comma clause", () => {
    renderV2Header(
      <DashboardV2Header
        displayName=""
        now={fixedNow}
        periodDesktop={null}
        periodMobile={null}
      />,
    );
    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon",
    );
  });
});

describe("dashboard header v1 vs v2 (OverviewPage)", () => {
  it("without data-theme wrapper: PageHeader Dashboard + period; greeting ABSENT; no new date row", () => {
    render(
      <OverviewPage
        title="Dashboard"
        periodControl={<div data-testid="v1-period">range</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByTestId("v1-period")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-v2-greeting")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-header")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
  });

  it("under v2 ThemeV2Only: greeting + today; no restaurant; no Dashboard H1", () => {
    render(
      <div data-theme={THEME_V2_ATTR}>
        <OverviewPage
          title="Dashboard"
          replaceHeader={
            <ThemeV2Only>
              <DashboardV2Header
                displayName="Ada"
                now={new Date(2026, 7, 23, 10, 0, 0)}
                periodDesktop={<div data-testid="v2-period-desktop">range</div>}
                periodMobile={<div data-testid="v2-period-mobile">chip</div>}
              />
            </ThemeV2Only>
          }
        />
      </div>,
    );

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good morning, Ada",
    );
    expect(screen.getByTestId("dashboard-v2-today").textContent).toBe(
      "23.08.2026",
    );
    expect(screen.queryByTestId("dashboard-v2-restaurant-chip")).toBeNull();
    expect(screen.getByTestId("v2-period-desktop")).toBeTruthy();
    expect(screen.getByTestId("v2-period-mobile")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });
});

describe("dashboard header theme gating (source)", () => {
  it("HomePage wires ThemeV2Only + DashboardV2Header only under v2Dashboard", () => {
    const page = sourceDeclaring("HomePage");
    const overview = sourceDeclaring("OverviewPage");
    expect(page).toContain('title="Dashboard"');
    expect(page).toContain(
      "periodControl={v2Dashboard ? undefined : periodControl}",
    );
    expect(page).toContain("replaceHeader=");
    expect(page).toContain("ThemeV2Only");
    expect(page).toContain("DashboardV2Header");
    expect(page).toContain("ReportDateRangeFields");
    expect(page).toContain("ReportPeriodTrigger");
    expect(overview).toContain("replaceHeader ??");
    expect(overview).toContain("PageHeader");
  });

  it("mutation: greeting leaks into v1 path → red", () => {
    const page = sourceDeclaring("HomePage");
    expect(page).toMatch(
      /replaceHeader=\{\s*v2Dashboard\s*\?\s*\([\s\S]*?ThemeV2Only[\s\S]*?DashboardV2Header[\s\S]*?\)\s*:\s*undefined/,
    );
    expect(page).toContain(
      "periodControl={v2Dashboard ? undefined : periodControl}",
    );
    expect(page).not.toMatch(/replaceHeader=\{\s*<DashboardV2Header/);
  });

  it("mutation: v2 still renders duplicated Dashboard PageHeader → red", () => {
    const page = sourceDeclaring("HomePage");
    const header = sourceDeclaring("DashboardV2Header");
    expect(page).toContain("DashboardV2Header");
    expect(header).toContain("dashboard-v2-greeting");
    expect(header).toContain("ThemeV2OnlyMarker");
    expect(page).toContain(
      "periodControl={v2Dashboard ? undefined : periodControl}",
    );
    expect(header).not.toContain(">Dashboard<");
    expect(header).not.toContain('title="Dashboard"');
  });

  it("mutation: restaurant name renders anywhere in the v2 header → red", () => {
    const header = sourceDeclaring("DashboardV2Header");
    const page = sourceDeclaring("HomePage");
    expect(header).not.toContain("restaurantName");
    expect(header).not.toContain("restaurantId");
    expect(header).not.toContain("entityAccentColor");
    expect(header).not.toContain("dashboard-v2-restaurant-chip");
    expect(header).not.toContain("dashboard-v2-restaurant-dot");
    expect(page).not.toMatch(
      /DashboardV2Header[\s\S]*?restaurantName=\{activeRestaurant/,
    );
  });

  it("mutation: date not on the greeting line → red", () => {
    const header = sourceAt(
      "components/dashboard/dashboard-v2-header.tsx",
    );
    expect(header).toContain('data-testid="dashboard-v2-header-row"');
    expect(header).toContain('data-testid="dashboard-v2-today"');
    expect(header).toContain('data-testid="dashboard-v2-greeting"');
    // Today must live inside the same row as the greeting (not only below).
    expect(header).toMatch(
      /dashboard-v2-header-row[\s\S]*?dashboard-v2-greeting[\s\S]*?dashboard-v2-today[\s\S]*?<\/div>/,
    );
    expect(header).toContain("justify-between");
  });
});
