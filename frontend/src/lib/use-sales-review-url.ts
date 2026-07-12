"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";

export type SalesReviewFilter = "all" | "pending" | "posted";

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

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
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

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, limit: "200" });
    if (review !== "all") params.set("review", review);
    return params.toString();
  }, [from, review, to]);

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, review });
    return params.toString();
  }, [from, review, to]);

  return { from, to, review, setRange, setReview, listQuery, exportQuery };
}
