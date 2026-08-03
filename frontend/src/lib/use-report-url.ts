"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange, resolveReportRange } from "@/lib/date-range";

export function useReportRangeFromUrl() {
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

  return { from, to, setRange, queryString: `from=${from}&to=${to}` };
}

export function useReportAsOfFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const asOf = useMemo(() => {
    const today = defaults.to;
    const param = searchParams.get("as_of");
    if (!param) return today;
    return param > today ? today : param;
  }, [defaults.to, searchParams]);

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
