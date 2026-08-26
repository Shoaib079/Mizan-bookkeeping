// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { sourceDeclaring } from "@/test-support/source";

vi.mock("@/lib/use-mobile-shell", () => ({
  useIsMobileShell: () => false,
}));

afterEach(cleanup);

describe("ReportDateRange mobile vs desktop", () => {
  it("mobile wrapper shows the period chip; desktop shows the field form", () => {
    render(
      <ReportDateRange
        from="2026-08-01"
        to="2026-08-23"
        onChange={() => {}}
      />,
    );

    expect(screen.getByTestId("report-date-range-mobile")).toBeTruthy();
    expect(screen.getByTestId("report-period-chip").textContent).toContain(
      "01.08.2026",
    );
    expect(screen.getByTestId("report-period-chip").textContent).toContain(
      "23.08.2026",
    );
    expect(screen.getByTestId("report-date-range-desktop")).toBeTruthy();
    expect(screen.getByTestId("report-date-range-fields")).toBeTruthy();
  });

  it("chip opens the period sheet with From/To/Apply", () => {
    render(
      <ReportDateRange
        from="2026-08-01"
        to="2026-08-23"
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("report-period-chip"));
    expect(screen.getByText("Report period")).toBeTruthy();
    expect(screen.getAllByTestId("report-date-range-fields").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("mutation: mobile stacked From/To without chip → red", () => {
    const src = sourceDeclaring("ReportDateRange");
    expect(src).toContain("report-date-range-mobile");
    expect(src).toContain("ReportPeriodTrigger");
    expect(src).toContain("sm:hidden");
    expect(src).toContain("hidden sm:block");
    expect(src).toContain("report-date-range-desktop");
    expect(src).not.toMatch(
      /export function ReportDateRange[\s\S]*?return \(\s*<ReportDateRangeFields/,
    );
  });
});

describe("dashboard no longer owns Apply/range", () => {
  it("HomePage pins MTD internally; no range UI or This period", () => {
    const page = sourceDeclaring("DashboardHomeContent");
    expect(page).toContain("currentMonthRange()");
    expect(page).toContain("dashboard?from=${from}&to=${to}");
    expect(page).toContain("[entityId, canReadFinancialReports]");
    expect(page).not.toContain('label="This period"');
    expect(page).not.toContain("net_result_kurus");
    expect(page).not.toContain("periodProps");
    expect(page).not.toContain("ReportDateRange");
    expect(page).not.toContain("setRange");
  });
});
