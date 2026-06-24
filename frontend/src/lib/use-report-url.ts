"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";

export function useReportRangeFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return { from, to, setRange, queryString: `from=${from}&to=${to}` };
}

export function useReportAsOfFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const asOf = searchParams.get("as_of") ?? defaults.to;

  const setAsOf = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("as_of", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return { asOf, setAsOf, queryString: `as_of=${asOf}` };
}
