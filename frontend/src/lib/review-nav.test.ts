import { describe, expect, it } from "vitest";

import {
  LEGACY_REVIEW_REDIRECTS,
  REVIEW_TAB_HREFS,
  reviewHrefForNeedsReviewKey,
} from "@/lib/review-routes";
import {
  navSectionForPathname,
  sidebarHrefActiveForPathname,
} from "@/lib/nav-sections";

describe("review hub navigation", () => {
  it("maps legacy review URLs to hub tabs or reports", () => {
    expect(LEGACY_REVIEW_REDIRECTS["/banking/review"]).toBe("/review/bank");
    expect(LEGACY_REVIEW_REDIRECTS["/review/posted"]).toBe("/reports/ledger");
    expect(LEGACY_REVIEW_REDIRECTS["/expenses"]).toBe("/review/expenses");
  });

  it("highlights Review sidebar on hub and tab routes", () => {
    expect(sidebarHrefActiveForPathname("/review", "/review/bank")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/banking/review")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/receipts/abc")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/review", "/review/expenses")).toBe(true);
  });

  it("resolves review section tabs including expenses", () => {
    const section = navSectionForPathname("/review/expenses");
    expect(section?.id).toBe("review");
    expect(section?.tabs.find((tab) => tab.match("/review/expenses"))?.label).toBe(
      "Expenses",
    );
  });

  it("maps dashboard needs-review keys to tab hrefs", () => {
    expect(reviewHrefForNeedsReviewKey("bank_statement_lines")).toBe(
      REVIEW_TAB_HREFS.bank,
    );
    expect(reviewHrefForNeedsReviewKey("pos_daily_summaries")).toBe(
      REVIEW_TAB_HREFS.sales,
    );
    expect(reviewHrefForNeedsReviewKey("invoice_drafts")).toBe(
      REVIEW_TAB_HREFS.invoices,
    );
    expect(reviewHrefForNeedsReviewKey("delivery_reports")).toBe(
      REVIEW_TAB_HREFS.delivery,
    );
    expect(reviewHrefForNeedsReviewKey("expense_entries")).toBe(
      REVIEW_TAB_HREFS.expenses,
    );
  });
});
