"use client";

/** Journal entry list — Record desk “Recent transactions” (and reusable elsewhere). */

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

function statusLabel(entry: RecentEntryRow): string {
  if (entry.status === "voided") return "Voided";
  return "Posted";
}

function EntryTableRow({
  entry,
  onOpen,
}: {
  entry: RecentEntryRow;
  onOpen: (row: RecentEntryRow) => void;
}) {
  const voided = entry.status === "voided";
  const corrected = entryWasCorrected(entry);

  return (
    <tr
      data-testid="recent-entry-row"
      data-entry-date={entry.entry_date}
      data-entry-status={entry.status ?? "posted"}
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        journalEntryRowClassName(entry.status ?? "posted"),
      )}
      onClick={() => onOpen(entry)}
    >
      <td
        data-testid="recent-entry-date"
        className="whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground tabular-nums"
      >
        {formatTrDate(entry.entry_date)}
      </td>
      <td className="px-2 py-2.5">
        <span
          data-testid="recent-entry-source"
          className="inline-flex rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
        >
          {journalSourceLabel(entry.source)}
        </span>
      </td>
      <td className="px-2 py-2.5 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "truncate font-medium",
              voided && "line-through",
            )}
          >
            {entry.description}
          </span>
          {corrected && !voided ? <EditedBadge /> : null}
        </span>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-2.5 text-right text-sm tabular-nums font-medium",
          voided && "line-through",
        )}
      >
        {formatTry(journalEntryTotalKurus(entry.lines))}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {voided ? <StatusBadge status="voided" /> : null}
          <span data-testid="recent-entry-status">{statusLabel(entry)}</span>
        </span>
      </td>
    </tr>
  );
}

export function RecentEntriesCard({
  entityId,
  className,
  title = "Recent transactions",
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col />
              <col className="w-[7.5rem]" />
              <col className="w-[5.5rem]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-2 py-2 text-left">
                  Date
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  Type
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  Description
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Amount
                </th>
                <th scope="col" className="px-2 py-2 text-left">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((entry) => (
                <EntryTableRow
                  key={entry.id}
                  entry={entry}
                  onOpen={openTransaction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
