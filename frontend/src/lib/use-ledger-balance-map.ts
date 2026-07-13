"use client";

/** Per-row ledger balance lookup for directory pages (audit A2 / M4 step 2).
 *
 * Staff and partners have no bulk balances endpoint — each balance comes from
 * that entity's ledger. This hook fans out one ledger fetch per id (the same
 * pattern the Balances tables use) and returns a lookup map, so the Staff and
 * Partners directories can show a Balance column and become self-sufficient. */

import { useEffect, useState } from "react";

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
): Result {
  const [balances, setBalances] = useState<Map<string, number>>(EMPTY);
  const [loading, setLoading] = useState(false);
  const key = ids.join(",");

  useEffect(() => {
    if (!entityId || ids.length === 0) {
      setBalances(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await apiFetch<unknown>(
              `/entities/${entityId}${buildPath(id)}`,
            );
            return [id, extract(res)] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      if (cancelled) return;
      setBalances(new Map(entries));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // buildPath/extract are stable by construction; re-run only when the set of
    // ids (key) or the entity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, key]);

  return { balances, loading };
}
