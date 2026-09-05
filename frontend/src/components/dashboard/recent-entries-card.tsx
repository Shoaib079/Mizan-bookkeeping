"use client";

/** Journal entry list — Record desk “Recent transactions” (and reusable elsewhere). */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecentEntriesMobileList } from "@/components/dashboard/recent-entries-mobile-list";
import { RecentEntriesTable } from "@/components/dashboard/recent-entries-table";
import { useTransactionPeek } from "@/components/ledger/transaction-drawer";
import { apiFetch } from "@/lib/api";
import {
  RECENT_ENTRIES_LIMIT,
  filterRecentEntriesForDisplay,
  recentEntriesListUrl,
  type RecentEntriesListResponse,
} from "@/lib/recent-entries";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

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
  title = "Recent transactions",
  listUrl,
  queryKey,
  emptyMessage = "Nothing recorded yet",
  viewAllHref = "/reports/ledger",
}: Props) {
  const isMobile = useIsMobileShell();
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

      {!loading && items.length > 0 &&
        (isMobile ? (
          <RecentEntriesMobileList items={items} onOpen={openTransaction} />
        ) : (
          <RecentEntriesTable items={items} onOpen={openTransaction} />
        ))}
    </section>
  );
}
