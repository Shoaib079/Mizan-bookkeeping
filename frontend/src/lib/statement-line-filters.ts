/** Statement line queue, filters, and summary stats for classify + ledger UI. */

import type { BankStatementLine } from "@/lib/banking-types";

export type StatementLineFilter =
  | "all"
  | "queue"
  | "posted"
  | "skipped"
  | "needs_review"
  | "outflow"
  | "no_ledger";

export const STATEMENT_LINE_FILTERS: {
  id: StatementLineFilter;
  label: string;
}[] = [
  { id: "queue", label: "To post" },
  { id: "all", label: "All lines" },
  { id: "posted", label: "Posted" },
  { id: "skipped", label: "Skipped (no GL)" },
  { id: "needs_review", label: "Needs review" },
  { id: "outflow", label: "Outflows" },
  { id: "no_ledger", label: "No ledger entry" },
];

/** Lines waiting for owner classification in the posting bar. */
export function isQueueLine(line: BankStatementLine): boolean {
  return line.status === "imported" || line.status === "needs_review";
}

/** Classified as unknown — no journal entry was created. */
export function isSkippedLine(line: BankStatementLine): boolean {
  return line.status === "classified" && line.classification === "unknown";
}

export function hasLedgerEntry(line: BankStatementLine): boolean {
  return line.journal_entry_id != null;
}

/** True when every line is still safe to remove with discard import. */
export function canDiscardStatement(lines: BankStatementLine[]): boolean {
  return !lines.some(
    (line) =>
      line.status === "posted" ||
      line.status === "linked" ||
      hasLedgerEntry(line),
  );
}

export function isCorrectableLine(line: BankStatementLine): boolean {
  return (
    line.status === "posted" ||
    line.status === "linked" ||
    line.status === "classified"
  );
}

export function sortStatementLines(lines: BankStatementLine[]): BankStatementLine[] {
  return [...lines].sort((a, b) => {
    const dateCmp = a.transaction_date.localeCompare(b.transaction_date);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });
}

export function queueLines(lines: BankStatementLine[]): BankStatementLine[] {
  return sortStatementLines(lines.filter(isQueueLine));
}

/** Default ledger filter after import: unposted queue when work remains, else full statement. */
export function defaultStatementLineFilter(
  lines: BankStatementLine[],
): StatementLineFilter {
  return queueLines(lines).length > 0 ? "queue" : "all";
}

export type StatementLineSummary = {
  total: number;
  queue: number;
  posted: number;
  linked: number;
  skipped: number;
  needsReview: number;
  outflows: number;
  withLedger: number;
  noLedger: number;
};

export function summarizeStatementLines(
  lines: BankStatementLine[],
): StatementLineSummary {
  let queue = 0;
  let posted = 0;
  let linked = 0;
  let skipped = 0;
  let needsReview = 0;
  let outflows = 0;
  let withLedger = 0;
  let noLedger = 0;

  for (const line of lines) {
    if (isQueueLine(line)) queue += 1;
    if (line.status === "posted") posted += 1;
    if (line.status === "linked") linked += 1;
    if (isSkippedLine(line)) skipped += 1;
    if (line.status === "needs_review") needsReview += 1;
    if (line.amount_kurus < 0) outflows += 1;
    if (hasLedgerEntry(line)) withLedger += 1;
    else noLedger += 1;
  }

  return {
    total: lines.length,
    queue,
    posted,
    linked,
    skipped,
    needsReview,
    outflows,
    withLedger,
    noLedger,
  };
}

export function matchesStatementLineFilter(
  line: BankStatementLine,
  filter: StatementLineFilter,
  search: string,
): boolean {
  const q = search.trim().toLowerCase();
  if (q) {
    const haystack = `${line.description} ${line.reference ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  switch (filter) {
    case "all":
      return true;
    case "queue":
      return isQueueLine(line);
    case "posted":
      return line.status === "posted";
    case "skipped":
      return isSkippedLine(line);
    case "needs_review":
      return line.status === "needs_review";
    case "outflow":
      return line.amount_kurus < 0;
    case "no_ledger":
      return !hasLedgerEntry(line);
    default:
      return true;
  }
}

export function filterStatementLines(
  lines: BankStatementLine[],
  filter: StatementLineFilter,
  search: string,
): BankStatementLine[] {
  return sortStatementLines(lines).filter((line) =>
    matchesStatementLineFilter(line, filter, search),
  );
}
