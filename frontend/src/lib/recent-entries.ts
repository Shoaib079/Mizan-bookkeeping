/** Recent journal entries — Record desk “Recently recorded” and ledger list. */

import { dateToIsoLocal } from "@/lib/dates";
import { sourceLabel } from "@/lib/transaction-registry";

export const RECENT_ENTRIES_LIMIT = 10;

export type RecentEntriesListOptions = {
  limit?: number;
  from?: string;
  to?: string;
  /** When true (default), hide voided originals and void-reversal rows. */
  effectiveOnly?: boolean;
};

export type RecentEntryLine = {
  amount_kurus: number;
  side: "debit" | "credit";
};

export type RecentEntryRow = {
  id: string;
  entry_date: string;
  description: string;
  source: string;
  status?: string;
  reverses_entry_id?: string | null;
  reversed_by_entry_id?: string | null;
  amends_entry_id?: string | null;
  amended_by_entry_id?: string | null;
  lines: RecentEntryLine[];
};

export type RecentEntriesListResponse = {
  items: RecentEntryRow[];
  total: number;
};

/**
 * GET /entities/{id}/ledger/entries — backend orders by entry_date desc,
 * created_at desc (answers “what did I just record?”).
 */
export function recentEntriesListUrl(
  entityId: string,
  options: RecentEntriesListOptions = {},
): string {
  const params = new URLSearchParams({
    limit: String(options.limit ?? RECENT_ENTRIES_LIMIT),
    offset: "0",
  });
  const effectiveOnly = options.effectiveOnly ?? true;
  if (effectiveOnly) params.set("effective_only", "true");
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  return `/entities/${entityId}/ledger/entries?${params.toString()}`;
}

/** ISO calendar date in the user's local timezone. */
export function todayIsoDate(reference = new Date()): string {
  return dateToIsoLocal(reference);
}

/** Drop voided originals and void-reversal rows; keep posted (incl. corrected). */
export function filterRecentEntriesForDisplay(
  items: RecentEntryRow[],
  limit: number = RECENT_ENTRIES_LIMIT,
): RecentEntryRow[] {
  return items
    .filter(
      (row) => row.status !== "voided" && !row.reverses_entry_id,
    )
    .slice(0, limit);
}

export function entryWasCorrected(row: RecentEntryRow): boolean {
  return Boolean(row.amends_entry_id || row.amended_by_entry_id);
}

export function journalEntryTotalKurus(lines: RecentEntryLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.side === "debit" ? line.amount_kurus : 0),
    0,
  );
}

/** Single label vocabulary with the transaction registry (no duplicates). */
export function journalSourceLabel(source: string): string {
  return sourceLabel(source);
}
