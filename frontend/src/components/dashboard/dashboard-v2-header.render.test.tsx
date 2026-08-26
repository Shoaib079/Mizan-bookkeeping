// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-shows-skeleton", () => ({
  useShowsSkeleton: () => false,
}));

import { DashboardV2Header } from "@/components/dashboard/dashboard-v2-header";
import { OverviewPage } from "@/components/page/overview-page";
import { sourceAt, sourceDeclaring } from "@/test-support/source";

afterEach(cleanup);

const fixedNow = new Date(2026, 7, 23, 14, 30, 0); // afternoon local

describe("DashboardV2Header", () => {
  it("greeting + name only; today's date ABSENT", () => {
    render(<DashboardV2Header displayName="Ada Yılmaz" now={fixedNow} />);

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon, Ada Yılmaz",
    );
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-right")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-period-desktop")).toBeNull();
    expect(screen.queryByTestId("dashboard-v2-period-mobile")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("greeting without name omits the comma clause", () => {
    render(<DashboardV2Header displayName="" now={fixedNow} />);
    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good afternoon",
    );
  });
});

describe("dashboard header via OverviewPage", () => {
  it("replaceHeader with DashboardV2Header: greeting; no Dashboard H1", () => {
    render(
      <OverviewPage
        title="Dashboard"
        replaceHeader={
          <DashboardV2Header
            displayName="Ada"
            now={new Date(2026, 7, 23, 10, 0, 0)}
          />
        }
      />,
    );

    expect(screen.getByTestId("dashboard-v2-greeting").textContent).toBe(
      "Good morning, Ada",
    );
    expect(screen.queryByTestId("dashboard-v2-today")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });

  it("without replaceHeader: PageHeader Dashboard (other pages still use it)", () => {
    render(<OverviewPage title="Dashboard" />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.queryByTestId("dashboard-v2-greeting")).toBeNull();
  });
});

describe("dashboard header wiring (source)", () => {
  it("HomePage always wires DashboardV2Header (no ThemeV2Only / v2Dashboard)", () => {
    const page = sourceDeclaring("DashboardHomeContent");
    const overview = sourceDeclaring("OverviewPage");
    expect(page).toContain('title="Dashboard"');
    expect(page).toContain("replaceHeader=");
    expect(page).toContain("DashboardV2Header");
    expect(page).not.toContain("ThemeV2Only");
    expect(page).not.toContain("useNewLookTheme");
    expect(page).not.toContain("v2Dashboard");
    expect(page).not.toContain("ReportDateRange");
    expect(page).not.toContain("periodControl=");
    expect(overview).toContain("replaceHeader ??");
    expect(overview).toContain("PageHeader");
  });

  it("mutation: old v1 header branch / ThemeV2Only gate returns → red", () => {
    const page = sourceDeclaring("DashboardHomeContent");
    expect(page).toMatch(
      /replaceHeader=\{\s*<DashboardV2Header[\s\S]*?\/>\s*\}/,
    );
    expect(page).not.toMatch(/v2Dashboard\s*\?/);
    expect(page).not.toContain("ThemeV2Only");
  });

  it("mutation: today's date reappears in header → red", () => {
    const header = sourceAt("components/dashboard/dashboard-v2-header.tsx");
    expect(header).toContain("dashboard-v2-greeting");
    expect(header).not.toContain("dashboard-v2-today");
    expect(header).not.toContain("formatTrDate");
    expect(header).not.toContain("isoToday");
    expect(header).not.toContain("periodDesktop");
    expect(header).not.toContain("periodMobile");
    expect(header).not.toContain("ThemeV2OnlyMarker");
  });
});
