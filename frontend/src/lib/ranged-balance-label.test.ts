/** S16 — ranged vs current balance sticker label (output only). */

import { describe, expect, it } from "vitest";

import { rangedBalanceLabel } from "@/lib/ranged-balance-label";
import { formatTrDate } from "@/lib/money";
import { supplierBalanceHeading } from "@/lib/supplier-balance";

const TODAY = "2026-08-21";
const CURRENT = supplierBalanceHeading(100_000);

describe("rangedBalanceLabel", () => {
  it("uses the current-balance label when no range is applied", () => {
    expect(
      rangedBalanceLabel({
        rangeTo: null,
        currentLabel: CURRENT,
        today: TODAY,
      }),
    ).toBe(CURRENT);
    expect(
      rangedBalanceLabel({
        rangeTo: undefined,
        currentLabel: CURRENT,
        today: TODAY,
      }),
    ).toBe(CURRENT);
    expect(CURRENT).toMatch(/owe/i);
  });

  it("keeps the current-balance label for month-to-date ending today", () => {
    expect(
      rangedBalanceLabel({
        rangeTo: TODAY,
        currentLabel: CURRENT,
        today: TODAY,
      }),
    ).toBe(CURRENT);
  });

  it("uses Closing in range · as of [to] when the range ends before today", () => {
    const to = "2026-06-30";
    expect(
      rangedBalanceLabel({
        rangeTo: to,
        currentLabel: CURRENT,
        today: TODAY,
      }),
    ).toBe(`Closing in range · as of ${formatTrDate(to)}`);
    expect(
      rangedBalanceLabel({
        rangeTo: to,
        currentLabel: CURRENT,
        today: TODAY,
      }),
    ).not.toBe(CURRENT);
  });
});
