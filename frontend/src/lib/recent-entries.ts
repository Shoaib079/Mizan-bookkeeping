/** Dashboard recent journal entries — shared with ledger report. */

import { sourceLabel } from "@/lib/transaction-registry";

export const RECENT_ENTRIES_LIMIT = 10;

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

export function recentEntriesListUrl(
  entityId: string,
  limit = RECENT_ENTRIES_LIMIT,
): string {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: "0",
    effective_only: "true",
  });
  return `/entities/${entityId}/ledger/entries?${params.toString()}`;
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
