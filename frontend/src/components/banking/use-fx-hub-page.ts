"use client";

/** State, loaders, and dialogs for FxHubPageContent. */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { FxLedgerEntryRead, MoneyAccountTree } from "@/lib/banking-types";
import {
  allFxAccounts,
  mergeFxLedgerEntries,
} from "@/lib/banking-tree-helpers";
import { useEntity } from "@/lib/entity-context";
import { filterLedgerRows } from "@/lib/ledger-display";
import { newIdempotencyKey } from "@/lib/use-submit-idempotency";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

export const FX_HUB_CURRENCY_FILTERS = ["USD", "EUR", "GBP"] as const;

export function useFxHubPage() {
  const { entityId } = useEntity();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { from, to, setRange } = useReportRangeFromUrl();

  const walletFilter = searchParams.get("wallet") ?? "all";

  const [tree, setTree] = useState<MoneyAccountTree | null>(null);
  const [ledgerByWallet, setLedgerByWallet] = useState<
    Map<string, FxLedgerEntryRead[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [addWalletCurrency, setAddWalletCurrency] = useState("USD");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const allWallets = useMemo(
    () => (tree ? allFxAccounts(tree) : []),
    [tree],
  );

  const currencyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wallet of allWallets) {
      const code = wallet.currency ?? "USD";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [allWallets]);

  const filteredWallets = useMemo(() => {
    if (walletFilter === "all") return allWallets;
    if (
      FX_HUB_CURRENCY_FILTERS.includes(
        walletFilter as (typeof FX_HUB_CURRENCY_FILTERS)[number],
      )
    ) {
      return allWallets.filter((wallet) => wallet.currency === walletFilter);
    }
    return allWallets.filter((wallet) => wallet.id === walletFilter);
  }, [allWallets, walletFilter]);

  const actionWallet = useMemo(() => {
    if (
      walletFilter !== "all" &&
      !FX_HUB_CURRENCY_FILTERS.includes(
        walletFilter as (typeof FX_HUB_CURRENCY_FILTERS)[number],
      )
    ) {
      return allWallets.find((wallet) => wallet.id === walletFilter) ?? null;
    }
    if (filteredWallets.length === 1) return filteredWallets[0] ?? null;
    return null;
  }, [allWallets, filteredWallets, walletFilter]);

  // Hub summary shows effective rows only — voided/superseded correction
  // history lives on the wallet detail page behind its history toggle.
  const mergedLedger = useMemo(
    () =>
      filterLedgerRows(
        mergeFxLedgerEntries(filteredWallets, ledgerByWallet),
        false,
      ),
    [filteredWallets, ledgerByWallet],
  );

  const missingCurrencies = useMemo(
    () =>
      FX_HUB_CURRENCY_FILTERS.filter(
        (currency) => !allWallets.some((w) => w.currency === currency),
      ),
    [allWallets],
  );

  const setWalletFilter = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("wallet");
      else params.set("wallet", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const reloadTree = useCallback(async () => {
    if (!entityId) {
      setTree(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MoneyAccountTree>(
        `/entities/${entityId}/banking/accounts/tree`,
      );
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const reloadLedger = useCallback(async () => {
    if (!entityId || filteredWallets.length === 0) {
      setLedgerByWallet(new Map());
      return;
    }
    setLedgerLoading(true);
    try {
      const ledgerQuery = new URLSearchParams({ from, to, limit: "50" });
      const results = await Promise.all(
        filteredWallets.map(async (wallet) => {
          const res = await apiFetch<{ items: FxLedgerEntryRead[] }>(
            `/entities/${entityId}/fx/accounts/${wallet.id}/ledger?${ledgerQuery}`,
          );
          return [wallet.id, res.items] as const;
        }),
      );
      setLedgerByWallet(new Map(results));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ledger load failed");
    } finally {
      setLedgerLoading(false);
    }
  }, [entityId, filteredWallets, from, to]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  useEffect(() => {
    void reloadLedger();
  }, [reloadLedger]);

  async function onDeactivate(walletId: string) {
    if (!entityId) return;
    setDeactivatingId(walletId);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/banking/accounts/${walletId}`, {
        method: "PATCH",
        idempotencyKey: newIdempotencyKey(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      });
      if (walletFilter === walletId) setWalletFilter("all");
      await reloadTree();
      await reloadLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setDeactivatingId(null);
    }
  }

  function onReload() {
    void reloadTree();
    void reloadLedger();
  }

  function openAddWallet(currency: string) {
    setAddWalletCurrency(currency);
    setAddWalletOpen(true);
  }

  const actionCurrency = actionWallet?.currency ?? "USD";

  return {
    entityId,
    tree,
    loading,
    error,
    from,
    to,
    setRange,
    ledgerLoading,
    mergedLedger,
    allWallets,
    currencyCounts,
    walletFilter,
    setWalletFilter,
    missingCurrencies,
    deactivatingId,
    onDeactivate,
    openAddWallet,
    actionWallet,
    actionCurrency,
    purchaseOpen,
    setPurchaseOpen,
    convertOpen,
    setConvertOpen,
    spendOpen,
    setSpendOpen,
    addWalletOpen,
    setAddWalletOpen,
    addWalletCurrency,
    onReload,
  };
}
