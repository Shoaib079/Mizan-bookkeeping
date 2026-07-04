import type { ReviewTabCounts } from "@/lib/review-counts-types";
import { REVIEW_TAB_HREFS, type ReviewTabId } from "@/lib/review-routes";

/** Fixed priority for smart-redirect: first tab with count > 0 wins. */
const TAB_PRIORITY: readonly ReviewTabId[] = [
  "bank",
  "invoices",
  "sales",
  "receipts",
  "delivery",
] as const;

/** Map Review hub tab href → count field from GET /review-counts. */
export function reviewTabCount(
  byTab: ReviewTabCounts,
  href: string,
): number {
  switch (href) {
    case "/review/bank":
      return byTab.bank;
    case "/review/sales":
      return byTab.sales;
    case "/review/receipts":
      return byTab.receipts;
    case "/review/invoices":
      return byTab.invoices;
    case "/review/delivery":
      return byTab.delivery;
    default:
      return 0;
  }
}

/** Return the href of the first Review tab with count > 0, or /review/bank. */
export function firstNonZeroReviewHref(byTab: ReviewTabCounts): string {
  for (const tab of TAB_PRIORITY) {
    if (byTab[tab] > 0) return REVIEW_TAB_HREFS[tab];
  }
  return REVIEW_TAB_HREFS.bank;
}
