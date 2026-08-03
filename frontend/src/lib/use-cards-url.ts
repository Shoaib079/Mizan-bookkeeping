"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange, resolveReportRange } from "@/lib/date-range";

export function useCardsUrl() {
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

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to, limit: "50" });
    return params.toString();
  }, [from, to]);

  return { from, to, setRange, listQuery };
}
