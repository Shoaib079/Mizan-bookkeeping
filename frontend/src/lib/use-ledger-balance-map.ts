"use client";

/** Per-row ledger balance lookup for directory pages (audit A2 / M4 step 2).
 *
 * Staff and partners have no bulk balances endpoint — each balance comes from
 * that entity's ledger. Backed by React Query so `mizan:ledger-changed`
 * invalidation refreshes the Balance column without a hand-rolled listener.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiFetch } from "@/lib/api";

type Result = {
  balances: Map<string, number>;
  loading: boolean;
};

const EMPTY = new Map<string, number>();

export function useLedgerBalanceMap(
  entityId: string | null,
  ids: string[],
  buildPath: (id: string) => string,
  extract: (res: unknown) => number,
  refreshKey = 0,
): Result {
  const queries = useQueries({
    queries: ids.map((id) => {
      const path = buildPath(id);
      return {
        queryKey: ["ledger-balance", entityId, path, refreshKey] as const,
        enabled: Boolean(entityId),
        queryFn: async (): Promise<number> => {
          const res = await apiFetch<unknown>(
            `/entities/${entityId}${path}`,
          );
          return extract(res);
        },
      };
    }),
  });

  const balances = useMemo(() => {
    if (!entityId || ids.length === 0) return EMPTY;
    const map = new Map<string, number>();
    ids.forEach((id, index) => {
      const q = queries[index];
      if (q?.isSuccess && typeof q.data === "number" && Number.isFinite(q.data)) {
        map.set(id, q.data);
      }
    });
    return map;
  }, [entityId, ids, queries]);

  const loading =
    Boolean(entityId) &&
    ids.length > 0 &&
    queries.some((q) => q.isPending);

  return { balances, loading };
}
