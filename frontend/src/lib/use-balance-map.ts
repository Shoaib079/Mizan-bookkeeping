"use client";

/** Balance lookups for directory pages (audit A2) — reuses the same
 * payables/receivables endpoints the Balances hub reads, so the numbers
 * always agree between the directory and the hub. */

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type BalanceMapState = {
  balances: Map<string, number>;
  totalKurus: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: BalanceMapState = {
  balances: new Map(),
  totalKurus: 0,
  loading: false,
  error: null,
};

function useBalanceMap(
  entityId: string,
  path: string,
  parse: (res: unknown) => { id: string; balanceKurus: number }[],
  totalOf: (res: unknown) => number,
): BalanceMapState & { reload: () => Promise<void> } {
  const [state, setState] = useState<BalanceMapState>(EMPTY);

  const reload = useCallback(async () => {
    if (!entityId) {
      setState(EMPTY);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiFetch<unknown>(`/entities/${entityId}${path}`);
      const rows = parse(res);
      setState({
        balances: new Map(rows.map((r) => [r.id, r.balanceKurus])),
        totalKurus: totalOf(res),
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        ...EMPTY,
        error: err instanceof Error ? err.message : "Failed to load balances",
      });
    }
  }, [entityId, path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}

type PayablesResponse = {
  total_payables_kurus: number;
  suppliers: { supplier_id: string; balance_kurus: number }[];
};

export function useSupplierBalances(entityId: string) {
  return useBalanceMap(
    entityId,
    "/payables?limit=500",
    (res) =>
      (res as PayablesResponse).suppliers.map((s) => ({
        id: s.supplier_id,
        balanceKurus: s.balance_kurus,
      })),
    (res) => (res as PayablesResponse).total_payables_kurus,
  );
}

type ReceivablesResponse = {
  total_receivables_kurus: number;
  customers: { customer_id: string; balance_kurus: number }[];
};

export function useCustomerBalances(entityId: string) {
  return useBalanceMap(
    entityId,
    "/receivables?limit=500",
    (res) =>
      (res as ReceivablesResponse).customers.map((c) => ({
        id: c.customer_id,
        balanceKurus: c.balance_kurus,
      })),
    (res) => (res as ReceivablesResponse).total_receivables_kurus,
  );
}
