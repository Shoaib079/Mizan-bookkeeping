/** Review hub tab routes (UX3). */

export type ReviewTabId =
  | "bank"
  | "sales"
  | "receipts"
  | "invoices"
  | "delivery"
  | "posted";

export const REVIEW_TAB_HREFS: Record<ReviewTabId, string> = {
  bank: "/review/bank",
  sales: "/review/sales",
  receipts: "/review/receipts",
  invoices: "/review/invoices",
  delivery: "/review/delivery",
  posted: "/review/posted",
};

/** Legacy bookmarks → Review hub tabs. */
export const LEGACY_REVIEW_REDIRECTS: Record<string, string> = {
  "/banking/review": "/review/bank",
  "/reports/ledger": "/review/posted",
};

export function reviewHrefForNeedsReviewKey(
  key:
    | "invoice_drafts"
    | "bank_statement_lines"
    | "pos_daily_summaries"
    | "delivery_reports"
    | "expense_entries",
): string {
  switch (key) {
    case "invoice_drafts":
      return REVIEW_TAB_HREFS.invoices;
    case "bank_statement_lines":
      return REVIEW_TAB_HREFS.bank;
    case "pos_daily_summaries":
      return REVIEW_TAB_HREFS.sales;
    case "delivery_reports":
      return REVIEW_TAB_HREFS.delivery;
    case "expense_entries":
      return REVIEW_TAB_HREFS.receipts;
  }
}
