// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { grantsForRole } from "@/lib/member-grants";
import type { SalesSummaryRead } from "@/lib/sales-summary-range";
import { sourceDeclaring } from "@/test-support/source";

const apiFetch = vi.fn();
const apiDownload = vi.fn();
const triggerBlobDownload = vi.fn();

const accessState = {
  grants: grantsForRole("owner") as string[],
};

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiDownload: (...args: unknown[]) => apiDownload(...args),
  triggerBlobDownload: (...args: unknown[]) => triggerBlobDownload(...args),
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "entity-1" }),
}));

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    role: "owner",
    grants: accessState.grants,
    loading: false,
    membershipSettled: true,
    canWriteOperations: true,
    canWriteDailyTransactions: true,
    canReadFinancialReports: true,
    canReadReports: true,
    canAccessSettings: true,
    reload: async () => undefined,
  }),
}));

const { SalesSummaryBlock } = await import(
  "@/components/sales/sales-summary-block"
);

const aug24 = new Date(2026, 7, 24, 12, 0, 0);

function summaryFixture(overrides?: Partial<SalesSummaryRead>): SalesSummaryRead {
  return {
    entity_id: "entity-1",
    delivery_enabled: true,
    current: {
      from_date: "2026-08-01",
      to_date: "2026-08-24",
      full_month: false,
      cash_kurus: 100_00,
      card_kurus: 200_00,
      delivery_kurus: 50_00,
      total_kurus: 350_00,
    },
    prior: {
      from_date: "2026-07-01",
      to_date: "2026-07-31",
      full_month: true,
      cash_kurus: 400_00,
      card_kurus: 500_00,
      delivery_kurus: 60_00,
      total_kurus: 960_00,
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  accessState.grants = grantsForRole("owner");
  apiFetch.mockReset();
  apiDownload.mockReset();
  triggerBlobDownload.mockReset();
});

beforeEach(() => {
  apiFetch.mockResolvedValue(summaryFixture());
});

describe("SalesSummaryBlock", () => {
  it("on 24.08 the right column caption shows full July", async () => {
    render(<SalesSummaryBlock now={aug24} />);

    await waitFor(() => {
      expect(screen.getByTestId("sales-summary-prior-caption").textContent).toBe(
        "01.07.2026 – 31.07.2026 · full month",
      );
    });
    expect(screen.getByTestId("sales-summary-current-caption").textContent).toBe(
      "01.08.2026 – 24.08.2026",
    );
  });

  it("chips switch the selected range (Last month → full July left)", async () => {
    render(<SalesSummaryBlock now={aug24} />);
    await waitFor(() => screen.getByTestId("sales-summary-block"));

    apiFetch.mockResolvedValue(
      summaryFixture({
        current: {
          from_date: "2026-07-01",
          to_date: "2026-07-31",
          full_month: true,
          cash_kurus: 10,
          card_kurus: 20,
          delivery_kurus: 0,
          total_kurus: 30,
        },
        prior: {
          from_date: "2026-06-01",
          to_date: "2026-06-30",
          full_month: true,
          cash_kurus: 1,
          card_kurus: 2,
          delivery_kurus: 0,
          total_kurus: 3,
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Last month" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/entities/entity-1/reports/sales-summary?from=2026-07-01&to=2026-07-31",
        ),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("sales-summary-current-caption").textContent).toBe(
        "01.07.2026 – 31.07.2026 · full month",
      );
      expect(screen.getByTestId("sales-summary-prior-caption").textContent).toBe(
        "01.06.2026 – 30.06.2026 · full month",
      );
    });
  });

  it("Custom chip opens the period picker", async () => {
    render(<SalesSummaryBlock now={aug24} />);
    await waitFor(() => screen.getByTestId("sales-summary-block"));

    expect(screen.queryByTestId("report-date-range")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByTestId("report-date-range")).toBeTruthy();
  });

  it("hides Delivery when delivery_enabled is false", async () => {
    apiFetch.mockResolvedValue(summaryFixture({ delivery_enabled: false }));
    render(<SalesSummaryBlock now={aug24} />);

    await waitFor(() => screen.getByTestId("sales-summary-columns"));
    expect(screen.queryByText("Delivery")).toBeNull();
    expect(screen.getAllByText("Cash").length).toBe(2);
    expect(screen.getAllByText("Card").length).toBe(2);
    expect(screen.getAllByText("Total").length).toBe(2);
  });

  it("export hits the sales-summary export route", async () => {
    apiDownload.mockResolvedValue({
      blob: new Blob(["x"]),
      filename: "sales-summary.xlsx",
    });
    render(<SalesSummaryBlock now={aug24} />);
    await waitFor(() => screen.getByTestId("sales-summary-columns"));

    fireEvent.click(screen.getByRole("button", { name: /Download Excel/i }));

    await waitFor(() => {
      expect(apiDownload).toHaveBeenCalledWith(
        expect.stringContaining(
          "/entities/entity-1/reports/sales-summary/export?from=2026-08-01&to=2026-08-24",
        ),
      );
    });
    expect(triggerBlobDownload).toHaveBeenCalled();
  });

  it("hides export without scope:export", async () => {
    accessState.grants = grantsForRole("cashier");
    render(<SalesSummaryBlock now={aug24} />);
    await waitFor(() => screen.getByTestId("sales-summary-block"));
    expect(screen.queryByRole("button", { name: /Download Excel/i })).toBeNull();
  });
});

describe("SalesPage wiring", () => {
  it("mounts SalesSummaryBlock above the sales list", () => {
    const page = sourceDeclaring("SalesPage");
    expect(page).toContain("SalesSummaryBlock");
    expect(page).toContain("LazySalesReviewPanel");
    const summaryAt = page.indexOf("SalesSummaryBlock");
    const listAt = page.indexOf("LazySalesReviewPanel");
    expect(summaryAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(summaryAt);
  });

  it("mutation: summary block missing from /sales → red → restore → green", () => {
    const page = sourceDeclaring("SalesPage");
    expect(page).toContain("<SalesSummaryBlock");
    const broken = page
      .replace(/import \{ SalesSummaryBlock \}[^\n]+\n/, "")
      .replace(/<SalesSummaryBlock\s*\/>\s*/, "");
    expect(broken).not.toContain("SalesSummaryBlock");
    expect(page).toContain("SalesSummaryBlock");
  });

  it("export source names the export route and canExportFiles", () => {
    const block = sourceDeclaring("SalesSummaryBlock");
    expect(block).toContain("/reports/sales-summary/export");
    expect(block).toContain("canExportFiles");
  });
});
