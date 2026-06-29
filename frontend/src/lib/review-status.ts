/** Terminal intake/draft statuses — no further confirm or reject actions. */
export function isReviewTerminalStatus(status: string): boolean {
  return status === "posted" || status === "rejected";
}

/** Drafts awaiting owner review in hub list tabs. */
export function isPendingReviewStatus(status: string): boolean {
  return (
    status === "draft" || status === "needs_review" || status === "duplicate"
  );
}
