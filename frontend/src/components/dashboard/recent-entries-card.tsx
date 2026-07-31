"use client";

/** Journal entry list — Add “Recorded today” and legacy dashboard card. */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTransactionPeek } from "@/components/ledger/transaction-drawer";
import { apiFetch } from "@/lib/api";
import { formatTrDate, formatTry } from "@/lib/money";
import {
  journalEntryTotalKurus,
  journalSourceLabel,
  recentEntriesListUrl,
  type RecentEntriesListResponse,
} from "@/lib/recent-entries";

type Props = {
  entityId: string;
  className?: string;
  title?: string;
  listUrl?: string;
  queryKey?: readonly unknown[];
  emptyMessage?: string;
  viewAllHref?: string;
};

export function RecentEntriesCard({
  entityId,
  className,
  title = "Recent entries",
  listUrl,
  queryKey,
  emptyMessage = "No entries yet",
  viewAllHref = "/reports/ledger",
}: Props) {
  const { openTransaction } = useTransactionPeek();
  const resolvedListUrl = listUrl ?? recentEntriesListUrl(entityId);
  const resolvedQueryKey = queryKey ?? ["recent-entries", entityId];

  const query = useQuery({
    queryKey: resolvedQueryKey,
    enabled: Boolean(entityId),
    queryFn: () =>
      apiFetch<RecentEntriesListResponse>(resolvedListUrl),
  });

  const items = query.data?.items ?? [];
  const loading = Boolean(entityId) && query.isPending;
  const error = query.error
    ? query.error.message || "Could not load recent entries"
    : null;

  return (
    <section
      className={`rounded-lg border border-border bg-card p-4${className ? ` ${className}` : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link
          href={viewAllHref}
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
            <li key={entry.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-sm px-1 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                onClick={() => openTransaction(entry)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {entry.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatTrDate(entry.entry_date)}
                    <span className="mx-1">·</span>
                    {journalSourceLabel(entry.source)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatTry(journalEntryTotalKurus(entry.lines))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
