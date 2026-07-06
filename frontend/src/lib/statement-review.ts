/** Statement review hub — tab filters and helpers. */

import type { StatementLineReview } from "@/lib/banking-types";

export type StatementReviewTab =
  | "needs_review"
  | "rule_auto"
  | "posted"
  | "linked";

export const STATEMENT_REVIEW_TABS: {
  id: StatementReviewTab;
  label: string;
}[] = [
  { id: "needs_review", label: "Needs review" },
  { id: "rule_auto", label: "Auto-posted" },
  { id: "posted", label: "Posted" },
  { id: "linked", label: "Linked" },
];

export function matchesReviewTab(
  line: StatementLineReview,
  tab: StatementReviewTab,
): boolean {
  switch (tab) {
    case "needs_review":
      return line.status === "needs_review";
    case "rule_auto":
      return line.classification_source === "rule_auto";
    case "posted":
      return (
        line.status === "posted" && line.classification_source !== "rule_auto"
      );
    case "linked":
      return line.status === "linked";
    default:
      return false;
  }
}

export function filterLinesByTab(
  lines: StatementLineReview[],
  tab: StatementReviewTab,
): StatementLineReview[] {
  return lines.filter((line) => matchesReviewTab(line, tab));
}

export function filterLinesByDateRange(
  lines: StatementLineReview[],
  from: string,
  to: string,
): StatementLineReview[] {
  return lines.filter(
    (line) => line.transaction_date >= from && line.transaction_date <= to,
  );
}

export function countLinesByTab(
  lines: StatementLineReview[],
): Record<StatementReviewTab, number> {
  return {
    needs_review: filterLinesByTab(lines, "needs_review").length,
    rule_auto: filterLinesByTab(lines, "rule_auto").length,
    posted: filterLinesByTab(lines, "posted").length,
    linked: filterLinesByTab(lines, "linked").length,
  };
}

/** Suggest a short counterparty token for learned rules (e.g. MIGROS). */
export function suggestMatchToken(description: string): string {
  const upper = description.match(/[A-ZİĞÜŞÖÇ][A-ZİĞÜŞÖÇa-zığüşöç0-9]+/);
  if (upper) return upper[0];
  const words = description.trim().split(/\s+/);
  return words[0]?.slice(0, 64) ?? description.slice(0, 64);
}

export function isLineCorrectable(line: StatementLineReview): boolean {
  return (
    line.status === "posted" ||
    line.status === "linked" ||
    line.status === "classified"
  );
}
