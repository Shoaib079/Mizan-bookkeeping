"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FxConversionForm } from "@/components/forms/fx-conversion-form";
import { FxExpenseSpendForm } from "@/components/forms/fx-expense-spend-form";
import { FxPurchaseForm } from "@/components/forms/fx-purchase-form";
import { MoneyAccountForm } from "@/components/forms/money-account-form";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { FxLedgerEntryRead, MoneyAccountTree } from "@/lib/banking-types";
import {
  allFxAccounts,
  canDeactivateFxWallet,
  mergeFxLedgerEntries,
} from "@/lib/banking-tree-helpers";
import { useEntity } from "@/lib/entity-context";
import { fxWalletToggleLabel } from "@/lib/fx-purchase-helpers";
import { formatFxNative } from "@/lib/fx-money";
import { formatTrDate, formatTry } from "@/lib/money";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

const CURRENCY_FILTERS = ["USD", "EUR", "GBP"] as const;

function walletChipLabel(
  currency: string | null | undefined,
  name: string,
  sameCurrencyCount: number,
): string {
  if (sameCurrencyCount > 1) return name;
  return fxWalletToggleLabel(currency);
}

export function FxHubPageContent() {
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
    if (CURRENCY_FILTERS.includes(walletFilter as (typeof CURRENCY_FILTERS)[number])) {
      return allWallets.filter((wallet) => wallet.currency === walletFilter);
    }
    return allWallets.filter((wallet) => wallet.id === walletFilter);
  }, [allWallets, walletFilter]);

  const actionWallet = useMemo(() => {
    if (
      walletFilter !== "all" &&
      !CURRENCY_FILTERS.includes(walletFilter as (typeof CURRENCY_FILTERS)[number])
    ) {
      return allWallets.find((wallet) => wallet.id === walletFilter) ?? null;
    }
    if (filteredWallets.length === 1) return filteredWallets[0] ?? null;
    return null;
  }, [allWallets, filteredWallets, walletFilter]);

  const mergedLedger = useMemo(
    () => mergeFxLedgerEntries(filteredWallets, ledgerByWallet),
    [filteredWallets, ledgerByWallet],
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

  return (
    <>
      <div className="mb-4">
        <Link href="/banking" className="text-sm text-primary hover:underline">
          ← Banking
        </Link>
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {!loading && tree && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              variant={walletFilter === "all" ? "primary" : "secondary"}
              onClick={() => setWalletFilter("all")}
            >
              All
            </Button>
            {allWallets.map((wallet) => {
              const currency = wallet.currency ?? "USD";
              const label = walletChipLabel(
                currency,
                wallet.name,
                currencyCounts.get(currency) ?? 1,
              );
              const selected = walletFilter === wallet.id;
              return (
                <div key={wallet.id} className="flex items-center gap-1">
                  <Button
                    type="button"
                    className="h-8 px-3 text-xs"
                    variant={selected ? "primary" : "secondary"}
                    onClick={() => setWalletFilter(wallet.id)}
                  >
                    {label}
                    {wallet.native_quantity !== null && wallet.native_quantity !== 0 && (
                      <span className="ml-1.5 tabular-nums opacity-80">
                        {formatFxNative(wallet.native_quantity, currency)}
                      </span>
                    )}
                  </Button>
                  {selected && canDeactivateFxWallet(wallet) && (
                    <Button
                      type="button"
                      className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                      variant="ghost"
                      disabled={deactivatingId === wallet.id}
                      onClick={() => void onDeactivate(wallet.id)}
                    >
                      {deactivatingId === wallet.id ? "…" : "Deactivate"}
                    </Button>
                  )}
                </div>
              );
            })}
            {CURRENCY_FILTERS.map((currency) => {
              const hasWallet = allWallets.some((w) => w.currency === currency);
              if (hasWallet) return null;
              return (
                <Button
                  key={currency}
                  type="button"
                  className="h-8 px-3 text-xs"
                  variant="secondary"
                  onClick={() => openAddWallet(currency)}
                >
                  + {currency}
                </Button>
              );
            })}
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              variant="secondary"
              onClick={() => openAddWallet("USD")}
            >
              + Add wallet
            </Button>
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {actionWallet
                ? `${actionWallet.name} selected`
                : "Select a wallet to buy, convert, or spend."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!actionWallet}
                onClick={() => setPurchaseOpen(true)}
              >
                Buy
              </Button>
              <Button
                variant="secondary"
                disabled={!actionWallet}
                onClick={() => setConvertOpen(true)}
              >
                Convert
              </Button>
              <Button
                variant="secondary"
                disabled={!actionWallet}
                onClick={() => setSpendOpen(true)}
              >
                Spend
              </Button>
            </div>
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold">Ledger</h2>
              <ReportDateRange
                from={from}
                to={to}
                disabled={ledgerLoading}
                onChange={setRange}
              />
            </div>
            {allWallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No FX wallets yet — add one above.
              </p>
            ) : ledgerLoading ? (
              <p className="text-sm text-muted-foreground">Loading ledger…</p>
            ) : mergedLedger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No FX movements in this date range.
              </p>
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Date</DataTableHeaderCell>
                    <DataTableHeaderCell>Wallet</DataTableHeaderCell>
                    <DataTableHeaderCell>Type</DataTableHeaderCell>
                    <DataTableHeaderCell>Description</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">FX</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">TRY cost</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {mergedLedger.map((row) => (
                    <DataTableRow key={row.id}>
                      <DataTableCell>
                        <Link
                          href={`/banking/fx/${row.fx_money_account_id}`}
                          className="text-primary hover:underline"
                        >
                          {formatTrDate(row.movement_date)}
                        </Link>
                      </DataTableCell>
                      <DataTableCell>
                        <Link
                          href={`/banking/fx/${row.fx_money_account_id}`}
                          className="text-primary hover:underline"
                        >
                          {row.wallet_name}
                        </Link>
                      </DataTableCell>
                      <DataTableCell>{row.movement_type}</DataTableCell>
                      <DataTableCell>{row.description}</DataTableCell>
                      <DataTableCell align="right">
                        {formatFxNative(
                          Math.abs(row.native_quantity),
                          row.wallet_currency,
                        )}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {formatTry(row.try_cost_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </section>
        </>
      )}

      <MoneyAccountForm
        open={addWalletOpen}
        onClose={() => setAddWalletOpen(false)}
        defaultKind="foreign_currency"
        defaultCurrency={addWalletCurrency}
        onSaved={onReload}
      />
      {actionWallet && (
        <>
          <FxPurchaseForm
            open={purchaseOpen}
            onClose={() => setPurchaseOpen(false)}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onReload}
          />
          <FxConversionForm
            open={convertOpen}
            onClose={() => setConvertOpen(false)}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onReload}
          />
          <FxExpenseSpendForm
            open={spendOpen}
            onClose={() => setSpendOpen(false)}
            fxAccountId={actionWallet.id}
            currency={actionCurrency}
            onSaved={onReload}
          />
        </>
      )}
    </>
  );
}
