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
  it("greeting + name only; today's date ABSENT", () => {
    renderV2Header(
      <DashboardV2Header displayName="Ada Yılmaz" now={fixedNow} />,
    );

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon, Ada Yılmaz",
    );
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-right")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-period-desktop")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-period-mobile")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("v2: greeting without name omits the comma clause", () => {
    renderV2Header(<DashboardV2Header displayName="" now={fixedNow} />);
    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon",
    );
  });
});

describe("dashboard header v1 vs v2 (OverviewPage)", () => {
  it("without data-theme wrapper: PageHeader Dashboard; greeting ABSENT; no date", () => {
    render(<OverviewPage title="Dashboard" />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.queryByTestId("dashboard-v2-greeting")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-header")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
  });

  it("under v2 ThemeV2Only: greeting present; no date; no Dashboard H1", () => {
    render(
      <div data-theme={THEME_V2_ATTR}>
        <OverviewPage
          title="Dashboard"
          replaceHeader={
            <ThemeV2Only>
              <DashboardV2Header
                displayName="Ada"
                now={new Date(2026, 7, 23, 10, 0, 0)}
              />
            </ThemeV2Only>
          }
        />
      </div>,
    );

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good morning, Ada",
    );
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });
});

describe("dashboard header theme gating (source)", () => {
  it("HomePage wires ThemeV2Only + DashboardV2Header only under v2Dashboard", () => {
    const page = sourceDeclaring("HomePage");
    const overview = sourceDeclaring("OverviewPage");
    expect(page).toContain('title="Dashboard"');
    expect(page).toContain("replaceHeader=");
    expect(page).toContain("ThemeV2Only");
    expect(page).toContain("DashboardV2Header");
    expect(page).not.toContain("ReportDateRange");
    expect(page).not.toContain("periodControl=");
    expect(overview).toContain("replaceHeader ??");
    expect(overview).toContain("PageHeader");
  });

  it("mutation: greeting leaks into v1 path → red", () => {
    const page = sourceDeclaring("HomePage");
    expect(page).toMatch(
      /replaceHeader=\{\s*v2Dashboard\s*\?\s*\([\s\S]*?ThemeV2Only[\s\S]*?DashboardV2Header[\s\S]*?\)\s*:\s*undefined/,
    );
    expect(page).not.toMatch(/replaceHeader=\{\s*<DashboardV2Header/);
  });

  it("mutation: today's date reappears in header → red", () => {
    const header = sourceAt("components/dashboard/dashboard-v2-header.tsx");
    expect(header).toContain("dashboard-v2-greeting");
    expect(header).not.toContain("dashboard-v2-today");
    expect(header).not.toContain("formatTrDate");
    expect(header).not.toContain("isoToday");
    expect(header).not.toContain("periodDesktop");
    expect(header).not.toContain("periodMobile");
  });
});
