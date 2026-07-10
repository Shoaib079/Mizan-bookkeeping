"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";

export type ExpenseReviewFilter = "all" | "needs_review" | "posted" | "voided";

export type ExpenseReviewView = "expenses" | "items";

export const EXPENSE_REVIEW_FILTERS: { id: ExpenseReviewFilter; label: string }[] =
  [
    { id: "all", label: "All" },
    { id: "needs_review", label: "Needs review" },
    { id: "posted", label: "Posted" },
    { id: "voided", label: "Voided" },
  ];

export const EXPENSE_REVIEW_VIEWS: { id: ExpenseReviewView; label: string }[] = [
  { id: "expenses", label: "Expenses" },
  { id: "items", label: "Items" },
];

export const EXPENSE_REVIEW_PAGE_SIZE = 50;

export const REVIEW_EXPENSES_HREF = "/review/expenses";
export const REVIEW_EXPENSES_ITEMS_HREF = "/review/expenses?view=items";

export function reviewExpensesFilteredHref(
  itemId: string,
  itemName: string,
): string {
  const params = new URLSearchParams({
    item: itemId,
    item_name: itemName,
  });
  return `${REVIEW_EXPENSES_HREF}?${params.toString()}`;
}

export function buildExpensesReviewListQuery(params: {
  from: string;
  to: string;
  offset: number;
  filter: ExpenseReviewFilter;
  expenseItemId?: string | null;
}): string {
  const search = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: String(EXPENSE_REVIEW_PAGE_SIZE),
    offset: String(params.offset),
  });
  if (params.filter !== "all") search.set("status", params.filter);
  if (params.expenseItemId) search.set("expense_item_id", params.expenseItemId);
  return search.toString();
}

export function useExpensesReviewUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const statusParam = searchParams.get("status");
  const filter: ExpenseReviewFilter =
    statusParam === "needs_review" ||
    statusParam === "posted" ||
    statusParam === "voided"
      ? statusParam
      : "all";
  const offset = Math.max(
    0,
    Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  );
  const viewParam = searchParams.get("view");
  const view: ExpenseReviewView = viewParam === "items" ? "items" : "expenses";
  const expenseItemId = searchParams.get("item");
  const expenseItemName = searchParams.get("item_name");

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

  const setView = useCallback(
    (next: ExpenseReviewView) => {
      replaceParams((params) => {
        if (next === "expenses") params.delete("view");
        else params.set("view", "items");
        params.delete("offset");
      });
    },
    [replaceParams],
  );

  const setExpenseItem = useCallback(
    (itemId: string, itemName: string) => {
      replaceParams((params) => {
        params.set("item", itemId);
        params.set("item_name", itemName);
        params.delete("view");
        params.delete("offset");
      });
    },
    [replaceParams],
  );

  const clearExpenseItem = useCallback(() => {
    replaceParams((params) => {
      params.delete("item");
      params.delete("item_name");
      params.delete("offset");
    });
  }, [replaceParams]);

  const listQuery = useMemo(
    () =>
      buildExpensesReviewListQuery({
        from,
        to,
        offset,
        filter,
        expenseItemId,
      }),
    [expenseItemId, filter, from, offset, to],
  );

  return {
    from,
    to,
    filter,
    offset,
    view,
    expenseItemId,
    expenseItemName,
    pageSize: EXPENSE_REVIEW_PAGE_SIZE,
    setRange,
    setFilter,
    setOffset,
    setView,
    setExpenseItem,
    clearExpenseItem,
    listQuery,
  };
}
