export type ReviewTabCounts = {
  bank: number;
  sales: number;
  receipts: number;
  invoices: number;
  delivery: number;
};

export type ReviewCounts = {
  total: number;
  by_tab: ReviewTabCounts;
  invoices_pending: number;
  invoices_ready_to_post: number;
};

export const EMPTY_REVIEW_COUNTS: ReviewCounts = {
  total: 0,
  by_tab: {
    bank: 0,
    sales: 0,
    receipts: 0,
    invoices: 0,
    delivery: 0,
  },
  invoices_pending: 0,
  invoices_ready_to_post: 0,
};

export const REVIEW_COUNTS_CHANGED_EVENT = "mizan:review-counts-changed";

export function invalidateReviewCounts(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REVIEW_COUNTS_CHANGED_EVENT));
}
