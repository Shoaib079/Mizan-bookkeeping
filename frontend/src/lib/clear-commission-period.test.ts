import { describe, expect, it, vi } from "vitest";

import {
  buildPeriodCardSalesPath,
  commissionPeriodRangeFromTrDate,
  fetchPeriodCardSalesKurus,
  sumCardSalesBatchKurus,
} from "@/lib/clear-commission-period";

describe("commissionPeriodRangeFromTrDate", () => {
  it("maps the clearance date to its full calendar month", () => {
    expect(commissionPeriodRangeFromTrDate("31.08.2026")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("returns null for an invalid display date", () => {
    expect(commissionPeriodRangeFromTrDate("not-a-date")).toBeNull();
  });
});

describe("sumCardSalesBatchKurus", () => {
  it("ignores voided batches", () => {
    expect(
      sumCardSalesBatchKurus([
        { gross_amount_kurus: 1_000_000, status: "posted" },
        { gross_amount_kurus: 500_000, status: "voided" },
      ]),
    ).toBe(1_000_000);
  });
});

describe("fetchPeriodCardSalesKurus", () => {
  it("pages through card sales for the requested range", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ gross_amount_kurus: 1_000_000, status: "posted" }],
        total: 101,
      })
      .mockResolvedValueOnce({
        items: [{ gross_amount_kurus: 250_000, status: "posted" }],
        total: 101,
      });

    const sum = await fetchPeriodCardSalesKurus(
      "ent-1",
      "2026-08-01",
      "2026-08-31",
      fetcher,
    );

    expect(sum).toBe(1_250_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      buildPeriodCardSalesPath("ent-1", "2026-08-01", "2026-08-31", 0),
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      buildPeriodCardSalesPath("ent-1", "2026-08-01", "2026-08-31", 100),
    );
  });
});
