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
import { sourceDeclaring } from "@/test-support/source";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const fixedNow = new Date(2026, 7, 23, 14, 30, 0); // afternoon local

function renderV2Header(ui: React.ReactElement) {
  return render(<div data-theme={THEME_V2_ATTR}>{ui}</div>);
}

describe("DashboardV2Header", () => {
  it("v2: greeting + name, restaurant chip with colour dot + today, period right-aligned at sm", () => {
    renderV2Header(
      <DashboardV2Header
        displayName="Ada Yılmaz"
        restaurantId="ent-1"
        restaurantName="Mizan Kitchen"
        now={fixedNow}
        periodControl={<div data-testid="fake-period">From / To</div>}
      />,
    );

    const greeting = screen.getByTestId("dashboard-v2-greeting");
    expect(greeting.textContent).toBe("Good afternoon, Ada Yılmaz");

    const chip = screen.getByTestId("dashboard-v2-restaurant-chip");
    expect(chip.textContent).toContain("Mizan Kitchen");
    expect(chip.textContent).toContain("23.08.2026");
    expect(screen.getByTestId("dashboard-v2-restaurant-dot")).toBeTruthy();

    const period = screen.getByTestId("dashboard-v2-period");
    expect(period.className).toContain("sm:ml-auto");
    expect(period.className).toContain("w-full");
    expect(screen.getByTestId("fake-period")).toBeTruthy();

    // Stacked below greeting on narrow; side-by-side >=sm.
    const row = screen.getByTestId("dashboard-v2-header-row");
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("sm:flex-row");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("v2: greeting without name omits the comma clause", () => {
    renderV2Header(
      <DashboardV2Header
        displayName=""
        restaurantId="ent-1"
        restaurantName="Cafe"
        now={fixedNow}
        periodControl={null}
      />,
    );
    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon",
    );
  });
});

describe("dashboard header v1 vs v2 (OverviewPage)", () => {
  it("without data-theme wrapper: PageHeader Dashboard + period; greeting ABSENT", () => {
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
  });

  it("under v2 ThemeV2Only: greeting present; no Dashboard H1/divider chrome", () => {
    render(
      <div data-theme={THEME_V2_ATTR}>
        <OverviewPage
          title="Dashboard"
          replaceHeader={
            <ThemeV2Only>
              <DashboardV2Header
                displayName="Ada"
                restaurantId="e1"
                restaurantName="Kitchen"
                now={new Date(2026, 7, 23, 10, 0, 0)}
                periodControl={<div data-testid="v2-period">range</div>}
              />
            </ThemeV2Only>
          }
        />
      </div>,
    );

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good morning, Ada",
    );
    expect(
      screen.getByTestId("dashboard-v2-restaurant-chip").textContent,
    ).toContain("Kitchen");
    expect(screen.getByTestId("v2-period")).toBeTruthy();
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
});
