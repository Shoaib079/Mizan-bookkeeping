"use client";

/** Balance lookups for directory pages (audit A2, query-backed in phase 6) —
 * reuses the same payables/receivables endpoints the Balances hub reads, so
 * the numbers always agree between the directory and the hub. */

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

export type ForexOutstanding = { currency: string; minor: number };

type BalanceMapResult = {
  balances: Map<string, number>;
  /** Per row, what is still owed in the currency it was agreed in. Only
   * populated for receivables — a supplier bill is always in lira. */
  forex: Map<string, ForexOutstanding[]>;
  totalKurus: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const EMPTY_MAP = new Map<string, number>();
const EMPTY_FOREX = new Map<string, ForexOutstanding[]>();

type ParsedRow = {
  id: string;
  balanceKurus: number;
  forex?: ForexOutstanding[];
};

function useBalanceMap(
  entityId: string,
  domain: string,
  path: string,
  parse: (res: unknown) => { rows: ParsedRow[]; total: number },
): BalanceMapResult {
  const query = useQuery({
    queryKey: ["balance-map", entityId, domain],
    enabled: Boolean(entityId),
    queryFn: async () => {
      const res = await apiFetch<unknown>(`/entities/${entityId}${path}`);
      const { rows, total } = parse(res);
      return {
        balances: new Map(rows.map((r) => [r.id, r.balanceKurus])),
        // Only rows that actually owe in a foreign currency get an entry, so
        // a lookup miss means "lira only" rather than "not loaded yet".
        forex: new Map(
          rows
            .filter((r) => r.forex && r.forex.length > 0)
            .map((r) => [r.id, r.forex!]),
        ),
        totalKurus: total,
      };
    },
  });

  return {
    balances: query.data?.balances ?? EMPTY_MAP,
    forex: query.data?.forex ?? EMPTY_FOREX,
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
  // API max list limit is 200 — higher values 422 and the hub shows ₺0.
  return useBalanceMap(entityId, "payables", "/payables?limit=200", (res) => {
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
  customers: {
    customer_id: string;
    balance_kurus: number;
    outstanding_by_currency?: ForexOutstanding[];
  }[];
};

export function useCustomerBalances(entityId: string) {
  return useBalanceMap(entityId, "receivables", "/receivables?limit=200", (res) => {
    const data = res as ReceivablesResponse;
    return {
      rows: data.customers.map((c) => ({
        id: c.customer_id,
        balanceKurus: c.balance_kurus,
        forex: c.outstanding_by_currency ?? [],
      })),
      total: data.total_receivables_kurus,
    };
  });
}
