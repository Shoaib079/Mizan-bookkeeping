/** Terminal intake/draft statuses — no further confirm or reject actions. */
export function isReviewTerminalStatus(status: string): boolean {
  return status === "posted" || status === "rejected";
}
