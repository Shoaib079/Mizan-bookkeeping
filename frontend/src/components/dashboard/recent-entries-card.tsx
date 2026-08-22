"use client";

/** Journal entry list — Record desk “Recently recorded” (and reusable elsewhere). */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { EditedBadge } from "@/components/ledger/corrected-badge";
import { useTransactionPeek } from "@/components/ledger/transaction-drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { journalEntryRowClassName } from "@/lib/ledger-display";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  RECENT_ENTRIES_LIMIT,
  entryWasCorrected,
  filterRecentEntriesForDisplay,
  journalEntryTotalKurus,
  journalSourceLabel,
  recentEntriesListUrl,
  type RecentEntriesListResponse,
  type RecentEntryRow,
} from "@/lib/recent-entries";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  className?: string;
  title?: string;
  listUrl?: string;
  queryKey?: readonly unknown[];
  emptyMessage?: string;
  viewAllHref?: string;
};

function EntryRow({
  entry,
  onOpen,
}: {
  entry: RecentEntryRow;
  onOpen: (row: RecentEntryRow) => void;
}) {
  const voided = entry.status === "voided";
  const corrected = entryWasCorrected(entry);

  return (
    <li>
      <button
        type="button"
        data-testid="recent-entry-row"
        data-entry-date={entry.entry_date}
        data-entry-status={entry.status ?? "posted"}
        className={cn(
          "flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-sm px-1 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 sm:py-2",
          journalEntryRowClassName(entry.status ?? "posted"),
        )}
        onClick={() => onOpen(entry)}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "block truncate font-medium",
                voided && "line-through",
              )}
            >
              {entry.description}
            </span>
            {voided ? <StatusBadge status="voided" /> : null}
            {corrected && !voided ? <EditedBadge /> : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span data-testid="recent-entry-date">
              {formatTrDate(entry.entry_date)}
            </span>
            <span
              data-testid="recent-entry-source"
              className="inline-flex rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
            >
              {journalSourceLabel(entry.source)}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 tabular-nums font-medium",
            voided && "line-through",
          )}
        >
          {formatTry(journalEntryTotalKurus(entry.lines))}
        </span>
      </button>
    </li>
  );
}

export function RecentEntriesCard({
  entityId,
  className,
  title = "Recently recorded",
  listUrl,
  queryKey,
  emptyMessage = "Nothing recorded yet",
  viewAllHref = "/reports/ledger",
}: Props) {
  const { openTransaction } = useTransactionPeek();
  const resolvedListUrl = listUrl ?? recentEntriesListUrl(entityId);
  const resolvedQueryKey = queryKey ?? ["recent-entries", entityId];

  const query = useQuery({
    queryKey: resolvedQueryKey,
    enabled: Boolean(entityId),
    queryFn: () => apiFetch<RecentEntriesListResponse>(resolvedListUrl),
  });

  const items = useMemo(
    () =>
      filterRecentEntriesForDisplay(
        query.data?.items ?? [],
        RECENT_ENTRIES_LIMIT,
      ),
    [query.data?.items],
  );
  const loading = Boolean(entityId) && query.isPending;
  const error = query.error
    ? query.error.message || "Could not load recent entries"
    : null;

  return (
    <section
      data-testid="recent-entries-card"
      className={`rounded-lg border border-border bg-card p-4${className ? ` ${className}` : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link
          href={viewAllHref}
          data-testid="recent-entries-view-all"
          className="text-xs text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading entries…</p>
      )}

      {error && !loading && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onOpen={openTransaction}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
