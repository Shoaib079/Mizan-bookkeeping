"use client";

/** FX hub wallet filter chips, deactivate, and add-wallet shortcuts. */

import { Button } from "@/components/ui/button";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { canDeactivateFxWallet } from "@/lib/banking-tree-helpers";
import { formatFxNative } from "@/lib/fx-money";
import { fxWalletToggleLabel } from "@/lib/fx-purchase-helpers";

function walletChipLabel(
  currency: string | null | undefined,
  name: string,
  sameCurrencyCount: number,
): string {
  if (sameCurrencyCount > 1) return name;
  return fxWalletToggleLabel(currency);
}

export type FxHubWalletChipsProps = {
  allWallets: MoneyAccountLeaf[];
  currencyCounts: Map<string, number>;
  walletFilter: string;
  onWalletFilter: (next: string) => void;
  missingCurrencies: readonly string[];
  deactivatingId: string | null;
  onDeactivate: (walletId: string) => void;
  onOpenAddWallet: (currency: string) => void;
};

export function FxHubWalletChips({
  allWallets,
  currencyCounts,
  walletFilter,
  onWalletFilter,
  missingCurrencies,
  deactivatingId,
  onDeactivate,
  onOpenAddWallet,
}: FxHubWalletChipsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        className="h-8 px-3 text-xs"
        variant={walletFilter === "all" ? "primary" : "secondary"}
        onClick={() => onWalletFilter("all")}
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
              onClick={() => onWalletFilter(wallet.id)}
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
      {missingCurrencies.map((currency) => (
        <Button
          key={currency}
          type="button"
          className="h-8 px-3 text-xs"
          onClick={() => onOpenAddWallet(currency)}
        >
          + {currency}
        </Button>
      ))}
      <Button
        type="button"
        className="h-8 px-3 text-xs"
        onClick={() => onOpenAddWallet("USD")}
      >
        + Add wallet
      </Button>
    </div>
  );
}
