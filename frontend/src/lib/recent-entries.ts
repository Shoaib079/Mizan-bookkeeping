/** Recent journal entries — Add “Recorded today” and ledger report. */

import { dateToIsoLocal } from "@/lib/dates";
import { sourceLabel } from "@/lib/transaction-registry";

export const RECENT_ENTRIES_LIMIT = 10;

export type RecentEntriesListOptions = {
  limit?: number;
  from?: string;
  to?: string;
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

export function recentEntriesListUrl(
  entityId: string,
  options: RecentEntriesListOptions = {},
): string {
  const params = new URLSearchParams({
    limit: String(options.limit ?? RECENT_ENTRIES_LIMIT),
    offset: "0",
    effective_only: "true",
  });
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  return `/entities/${entityId}/ledger/entries?${params.toString()}`;
}

/** ISO calendar date in the user's local timezone. */
export function todayIsoDate(reference = new Date()): string {
  return dateToIsoLocal(reference);
}

export function recordedTodayListUrl(
  entityId: string,
  reference = new Date(),
): string {
  const iso = todayIsoDate(reference);
  return recentEntriesListUrl(entityId, { from: iso, to: iso });
}

export function recordedTodayLedgerHref(reference = new Date()): string {
  const iso = todayIsoDate(reference);
  return `/reports/ledger?from=${encodeURIComponent(iso)}&to=${encodeURIComponent(iso)}`;
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
