"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";

export type ExpenseReviewFilter = "all" | "needs_review" | "posted";

export const EXPENSE_REVIEW_FILTERS: { id: ExpenseReviewFilter; label: string }[] =
  [
    { id: "all", label: "All" },
    { id: "needs_review", label: "Needs review" },
    { id: "posted", label: "Posted" },
  ];

export function useExpensesReviewUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const statusParam = searchParams.get("status");
  const filter: ExpenseReviewFilter =
    statusParam === "needs_review" || statusParam === "posted"
      ? statusParam
      : "all";

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setFilter = useCallback(
    (next: ExpenseReviewFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("status");
      else params.set("status", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      from,
      to,
      limit: "50",
    });
    if (filter !== "all") params.set("status", filter);
    return params.toString();
  }, [filter, from, to]);

  return { from, to, filter, setRange, setFilter, listQuery };
}
