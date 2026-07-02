"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { currentMonthRange } from "@/lib/date-range";
import { buildRangeQuery } from "@/lib/date-range";

export function useDeliveryHubUrl(basePath: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaults = useMemo(() => currentMonthRange(), []);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const platform = searchParams.get("platform");

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", nextFrom);
      params.set("to", nextTo);
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  const setPlatform = useCallback(
    (platformId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (platformId) params.set("platform", platformId);
      else params.delete("platform");
      params.delete("report");
      params.delete("settlement");
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  const setDetailId = useCallback(
    (key: "report" | "settlement", id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("report");
      params.delete("settlement");
      if (id) params.set(key, id);
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );

  const listQuery = useMemo(() => {
    const params = new URLSearchParams(buildRangeQuery(from, to));
    if (platform) params.set("delivery_platform_id", platform);
    return params.toString();
  }, [from, platform, to]);

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams(buildRangeQuery(from, to));
    if (platform) params.set("delivery_platform_id", platform);
    return params.toString();
  }, [from, platform, to]);

  return {
    from,
    to,
    platform,
    setRange,
    setPlatform,
    setDetailId,
    listQuery,
    exportQuery,
    reportId: searchParams.get("report"),
    settlementId: searchParams.get("settlement"),
  };
}
