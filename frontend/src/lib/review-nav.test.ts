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
  it("maps legacy review URLs to hub tabs", () => {
    expect(LEGACY_REVIEW_REDIRECTS["/banking/review"]).toBe("/review/bank");
    expect(LEGACY_REVIEW_REDIRECTS["/reports/ledger"]).toBe("/review/posted");
  });

  it("highlights Review sidebar on hub and tab routes", () => {
    expect(sidebarHrefActiveForPathname("/review", "/review/bank")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/posted")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/banking/review")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/receipts/abc")).toBe(
      true,
    );
  });

  it("resolves review section tabs", () => {
    const section = navSectionForPathname("/review/invoices");
    expect(section?.id).toBe("review");
    expect(section?.tabs.find((tab) => tab.match("/review/invoices"))?.label).toBe(
      "Invoices",
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
      REVIEW_TAB_HREFS.receipts,
    );
  });
});
