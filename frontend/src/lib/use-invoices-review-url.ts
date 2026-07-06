"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";
import {
  INVOICE_REVIEW_TABS,
  invoiceReviewListPath,
  type InvoiceReviewTab,
} from "@/lib/invoice-draft-list";

const TAB_IDS = new Set(INVOICE_REVIEW_TABS.map((tab) => tab.id));

export function useInvoicesReviewUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const tabParam = searchParams.get("tab");
  const activeTab: InvoiceReviewTab =
    tabParam && TAB_IDS.has(tabParam as InvoiceReviewTab)
      ? (tabParam as InvoiceReviewTab)
      : "pending";

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
    (next: InvoiceReviewTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "pending") params.delete("tab");
      else params.set("tab", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const listPath = useMemo(
    () => invoiceReviewListPath(activeTab, from, to),
    [activeTab, from, to],
  );

  return { from, to, activeTab, setRange, setActiveTab, listPath };
}
