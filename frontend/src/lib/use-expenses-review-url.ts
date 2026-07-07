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

export const EXPENSE_REVIEW_PAGE_SIZE = 50;

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
  const offset = Math.max(
    0,
    Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  );

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      replaceParams((params) => {
        params.set("from", nextFrom);
        params.set("to", nextTo);
        params.delete("offset");
      });
    },
    [replaceParams],
  );

  const setFilter = useCallback(
    (next: ExpenseReviewFilter) => {
      replaceParams((params) => {
        if (next === "all") params.delete("status");
        else params.set("status", next);
        params.delete("offset");
      });
    },
    [replaceParams],
  );

  const setOffset = useCallback(
    (nextOffset: number) => {
      replaceParams((params) => {
        if (nextOffset <= 0) params.delete("offset");
        else params.set("offset", String(nextOffset));
      });
    },
    [replaceParams],
  );

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      from,
      to,
      limit: String(EXPENSE_REVIEW_PAGE_SIZE),
      offset: String(offset),
    });
    if (filter !== "all") params.set("status", filter);
    return params.toString();
  }, [filter, from, offset, to]);

  return {
    from,
    to,
    filter,
    offset,
    pageSize: EXPENSE_REVIEW_PAGE_SIZE,
    setRange,
    setFilter,
    setOffset,
    listQuery,
  };
}
