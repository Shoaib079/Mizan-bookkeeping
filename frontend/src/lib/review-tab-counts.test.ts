import { describe, expect, it } from "vitest";

import { firstNonZeroReviewHref, reviewTabCount } from "@/lib/review-tab-counts";
import { EMPTY_REVIEW_COUNTS, type ReviewTabCounts } from "@/lib/review-counts-types";

describe("reviewTabCount", () => {
  it("maps review tab hrefs to count fields", () => {
    const byTab = {
      ...EMPTY_REVIEW_COUNTS.by_tab,
      bank: 2,
      invoices: 5,
    };
    expect(reviewTabCount(byTab, "/review/bank")).toBe(2);
    expect(reviewTabCount(byTab, "/review/invoices")).toBe(5);
    expect(reviewTabCount(byTab, "/review/expenses")).toBe(0);
    expect(reviewTabCount(byTab, "/review/manual-journals")).toBe(0);
  });
});

describe("firstNonZeroReviewHref", () => {
  const zero: ReviewTabCounts = {
    bank: 0,
    invoices: 0,
    sales: 0,
    receipts: 0,
    expenses: 0,
    delivery: 0,
  };

  it("returns /review/bank when all counts are zero", () => {
    expect(firstNonZeroReviewHref(zero)).toBe("/review/bank");
  });

  it("returns /review/invoices when only invoices have items", () => {
    expect(firstNonZeroReviewHref({ ...zero, invoices: 3 })).toBe("/review/invoices");
  });

  it("returns /review/bank when bank has items (highest priority)", () => {
    expect(
      firstNonZeroReviewHref({
        bank: 1,
        invoices: 3,
        sales: 0,
        receipts: 0,
        expenses: 0,
        delivery: 0,
      }),
    ).toBe("/review/bank");
  });

  it("prefers invoices over sales when bank is zero", () => {
    expect(
      firstNonZeroReviewHref({
        bank: 0,
        invoices: 2,
        sales: 5,
        receipts: 0,
        expenses: 0,
        delivery: 0,
      }),
    ).toBe("/review/invoices");
  });

  it("falls through to delivery when only delivery has items", () => {
    expect(firstNonZeroReviewHref({ ...zero, delivery: 1 })).toBe("/review/delivery");
  });

  it("returns /review/sales when only sales has items", () => {
    expect(firstNonZeroReviewHref({ ...zero, sales: 4 })).toBe("/review/sales");
  });

  it("returns /review/receipts when only receipts has items", () => {
    expect(firstNonZeroReviewHref({ ...zero, receipts: 7 })).toBe("/review/receipts");
  });

  it("priority order: bank > invoices > sales > receipts > expenses > delivery", () => {
    const all: ReviewTabCounts = {
      bank: 1,
      invoices: 2,
      sales: 3,
      receipts: 4,
      expenses: 5,
      delivery: 6,
    };
    expect(firstNonZeroReviewHref(all)).toBe("/review/bank");

    expect(firstNonZeroReviewHref({ ...all, bank: 0 })).toBe("/review/invoices");
    expect(firstNonZeroReviewHref({ ...all, bank: 0, invoices: 0 })).toBe("/review/sales");
    expect(firstNonZeroReviewHref({ ...all, bank: 0, invoices: 0, sales: 0 })).toBe(
      "/review/receipts",
    );
    expect(
      firstNonZeroReviewHref({
        ...all,
        bank: 0,
        invoices: 0,
        sales: 0,
        receipts: 0,
      }),
    ).toBe("/review/expenses");
    expect(
      firstNonZeroReviewHref({
        ...all,
        bank: 0,
        invoices: 0,
        sales: 0,
        receipts: 0,
        expenses: 0,
      }),
    ).toBe("/review/delivery");
  });
});
