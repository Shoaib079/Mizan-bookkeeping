"use client";

/** Balance lookups for directory pages (audit A2, query-backed in phase 6) —
 * reuses the same payables/receivables endpoints the Balances hub reads, so
 * the numbers always agree between the directory and the hub. */

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

type BalanceMapResult = {
  balances: Map<string, number>;
  totalKurus: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const EMPTY_MAP = new Map<string, number>();

function useBalanceMap(
  entityId: string,
  domain: string,
  path: string,
  parse: (res: unknown) => { rows: { id: string; balanceKurus: number }[]; total: number },
): BalanceMapResult {
  const query = useQuery({
    queryKey: ["balance-map", entityId, domain],
    enabled: Boolean(entityId),
    queryFn: async () => {
      const res = await apiFetch<unknown>(`/entities/${entityId}${path}`);
      const { rows, total } = parse(res);
      return {
        balances: new Map(rows.map((r) => [r.id, r.balanceKurus])),
        totalKurus: total,
      };
    },
  });

  return {
    balances: query.data?.balances ?? EMPTY_MAP,
    totalKurus: query.data?.totalKurus ?? 0,
    loading: Boolean(entityId) && query.isPending,
    error: query.error ? query.error.message || "Failed to load balances" : null,
    reload: async () => {
      await query.refetch();
    },
  };
}

type PayablesResponse = {
  total_payables_kurus: number;
  suppliers: { supplier_id: string; balance_kurus: number }[];
};

export function useSupplierBalances(entityId: string) {
  return useBalanceMap(entityId, "payables", "/payables?limit=500", (res) => {
    const data = res as PayablesResponse;
    return {
      rows: data.suppliers.map((s) => ({
        id: s.supplier_id,
        balanceKurus: s.balance_kurus,
      })),
      total: data.total_payables_kurus,
    };
  });
}

type ReceivablesResponse = {
  total_receivables_kurus: number;
  customers: { customer_id: string; balance_kurus: number }[];
};

export function useCustomerBalances(entityId: string) {
  return useBalanceMap(entityId, "receivables", "/receivables?limit=500", (res) => {
    const data = res as ReceivablesResponse;
    return {
      rows: data.customers.map((c) => ({
        id: c.customer_id,
        balanceKurus: c.balance_kurus,
      })),
      total: data.total_receivables_kurus,
    };
  });
}
