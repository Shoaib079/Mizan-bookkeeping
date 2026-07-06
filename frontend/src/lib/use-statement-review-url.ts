"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";
import type { StatementReviewTab } from "@/lib/statement-review";
import { STATEMENT_REVIEW_TABS } from "@/lib/statement-review";

const TAB_IDS = new Set(
  STATEMENT_REVIEW_TABS.map((tab) => tab.id),
);

export function useStatementReviewUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const tabParam = searchParams.get("tab");
  const activeTab: StatementReviewTab =
    tabParam && TAB_IDS.has(tabParam as StatementReviewTab)
      ? (tabParam as StatementReviewTab)
      : "needs_review";

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setActiveTab = useCallback(
    (next: StatementReviewTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "needs_review") params.delete("tab");
      else params.set("tab", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return { from, to, activeTab, setRange, setActiveTab };
}
