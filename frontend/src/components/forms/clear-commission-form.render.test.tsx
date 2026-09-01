// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/lib/dates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dates")>("@/lib/dates");
  return {
    ...actual,
    todayTrDate: () => "31.08.2026",
  };
});
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { ClearCommissionForm } = await import(
  "@/components/forms/clear-commission-form"
);

function cardSalesUrl(from: string, to: string, offset = 0) {
  return `/entities/ent-1/pos/card-sales?from=${from}&to=${to}&limit=100&offset=${offset}`;
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url.includes("/commission-rates")) {
      return Promise.resolve({ periods: [] });
    }
    if (url.includes("/clearing-reconciliation/clear-commission")) {
      return Promise.resolve({});
    }
    if (url.includes("/clearing-reconciliation")) {
      return Promise.resolve({
        clearing_balance_kurus: 0,
        total_card_sales_kurus: 357_014_900,
      });
    }
    if (url === cardSalesUrl("2026-08-01", "2026-08-31")) {
      return Promise.resolve({
        items: [{ gross_amount_kurus: 32_600_000, status: "posted" }],
        total: 1,
      });
    }
    if (url === cardSalesUrl("2026-07-01", "2026-07-31")) {
      return Promise.resolve({
        items: [{ gross_amount_kurus: 10_000_000, status: "posted" }],
        total: 1,
      });
    }
    return Promise.resolve({ items: [], total: 0 });
  });
});

afterEach(cleanup);

describe("ClearCommissionForm period card sales", () => {
  it("fetches card sales for the commission month, not all-time", async () => {
    render(<ClearCommissionForm open onClose={() => undefined} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(cardSalesUrl("2026-08-01", "2026-08-31"));
    });
    expect(
      apiFetch.mock.calls.some(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/clearing-reconciliation") &&
          !url.includes("commission-rates") &&
          !url.includes("clear-commission") &&
          url.includes("from="),
      ),
    ).toBe(false);
  });

  it("shows the implied rate against period sales", async () => {
    render(<ClearCommissionForm open onClose={() => undefined} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(cardSalesUrl("2026-08-01", "2026-08-31"));
    });

    fireEvent.change(screen.getByLabelText(/Commission charged/i), {
      target: { value: "12.400,00" },
    });

    expect(await screen.findByText(/3,8%/)).toBeTruthy();
    expect(screen.getByText(/August 2026 card sales/)).toBeTruthy();
    expect(screen.queryByText(/3\.570\.149/)).toBeNull();
  });

  it("refetches when the clearance date moves to another month", async () => {
    render(<ClearCommissionForm open onClose={() => undefined} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(cardSalesUrl("2026-08-01", "2026-08-31"));
    });

    fireEvent.change(screen.getByLabelText(/Date \(DD\.MM\.YYYY\)/i), {
      target: { value: "31.07.2026" },
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(cardSalesUrl("2026-07-01", "2026-07-31"));
    });
  });
});
