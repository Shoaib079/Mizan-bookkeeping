"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { currentMonthRange, resolveReportRange } from "@/lib/date-range";

/** Matches ENTITY_LIST_PAGE_SIZE so every list in the app pages alike. */
export const SALES_PAGE_SIZE = 50;

export type SalesReviewFilter = "all" | "pending" | "posted";

/** Does this view honour the date range in the toolbar?
 *
 * Only settled ones. A view that includes work still waiting cannot be
 * narrowed by date, because the badge that sent you there counts by status
 * and ignores dates entirely — so the two disagree, the list looks empty,
 * and the date picker is the first thing anyone reaches for and never the
 * reason. A daily sales entry dated outside the current month was simply
 * invisible while the tab said there was one.
 *
 * `all` sits with the queues, not with `posted`: it contains outstanding
 * work, and outstanding work must never be hidden by a date default nobody
 * chose.
 */
export function salesFilterUsesRange(filter: SalesReviewFilter): boolean {
  return filter === "posted";
}

export const SALES_REVIEW_FILTERS: { id: SalesReviewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Needs review" },
  { id: "posted", label: "Posted" },
];

/** URL-driven sales list state. `defaultFilter` lets the two entry points of
 * the merged Sales page differ (M1): /sales defaults to All, /review/sales to
 * Needs review — the URL param always wins once the user picks a chip. */
export function useSalesReviewUrl(defaultFilter: SalesReviewFilter = "all") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const { from, to } = useMemo(
    () =>
      resolveReportRange(
        searchParams.get("from"),
        searchParams.get("to"),
        defaults,
      ),
    [defaults, searchParams],
  );
  const reviewParam = searchParams.get("review");
  const review: SalesReviewFilter =
    reviewParam === "pending" || reviewParam === "posted" || reviewParam === "all"
      ? reviewParam
      : defaultFilter;

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setReview = useCallback(
    (next: SalesReviewFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      // Always set explicitly so "All" works even where the default differs.
      params.set("review", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  /** One page at a time. This used to fetch limit=200 and tell the reader
   * "showing 200 — download Excel for the full list", which is the silent
   * truncation DESIGN_ARCHETYPES rule 5 exists to stop. */
  const [offset, setOffset] = useState(0);
  // A new period or filter starts at page one — otherwise you land on an
  // offset that no longer exists and see an empty table.
  useEffect(() => setOffset(0), [from, to, review]);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(SALES_PAGE_SIZE),
      offset: String(offset),
    });
    if (salesFilterUsesRange(review)) {
      params.set("from", from);
      params.set("to", to);
    }
    if (review !== "all") params.set("review", review);
    return params.toString();
  }, [from, offset, review, to]);

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, review });
    return params.toString();
  }, [from, review, to]);

  return {
    from,
    to,
    review,
    setRange,
    setReview,
    listQuery,
    exportQuery,
    offset,
    setOffset,
    pageSize: SALES_PAGE_SIZE,
  };
}
