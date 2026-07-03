import type { ReviewTabCounts } from "@/lib/review-counts-types";

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
