// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SalesPeriodChips } from "@/components/sales/sales-period-chips";

afterEach(cleanup);

describe("SalesPeriodChips", () => {
  const aug24 = new Date(2026, 7, 24, 12, 0, 0);

  it("defaults to This month for MTD range", () => {
    render(
      <SalesPeriodChips
        from="2026-08-01"
        to="2026-08-24"
        now={aug24}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "This month" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(screen.queryByTestId("report-date-range")).toBeNull();
  });

  it("Last month sets the full prior calendar month", () => {
    const onChange = vi.fn();
    render(
      <SalesPeriodChips
        from="2026-08-01"
        to="2026-08-24"
        now={aug24}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-01", "2026-07-31");
  });

  it("Custom opens the period picker", () => {
    render(
      <SalesPeriodChips
        from="2026-08-01"
        to="2026-08-24"
        now={aug24}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByTestId("report-date-range")).toBeTruthy();
  });
});
