"use client";

/** New-menu FX purchase — currency toggles + purchase fields on one screen. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FxPurchaseFormFields,
} from "@/components/forms/fx-purchase-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  loadAllForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { fxWalletToggleLabel } from "@/lib/fx-purchase-helpers";
import { useEntity } from "@/lib/entity-context";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function FxPurchaseQuickAction({ open, onClose }: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const reset = useCallback(() => {
    setAccounts([]);
    setLoadError(null);
    setSelectedId("");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!entityId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void loadAllForeignCurrencyAccounts(entityId)
      .then((items) => {
        if (cancelled) return;
        setAccounts(items);
        if (items[0]) {
          setSelectedId(items[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load FX accounts");
        setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, reset]);

  function handleClose() {
    reset();
    onClose();
  }

  const selected = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const selectedCurrency = selected?.currency
    ? fxWalletToggleLabel(selected.currency)
    : null;

  return (
    <Dialog open={open} title="Buy foreign currency" onClose={handleClose}>
      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar first.
        </p>
      )}

      {entityId && loading && (
        <p className="text-sm text-muted-foreground">Loading FX accounts…</p>
      )}

      {entityId && !loading && loadError && (
        <p className="text-sm text-destructive">{loadError}</p>
      )}

      {entityId && !loading && !loadError && accounts.length === 0 && (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            No foreign currency wallet found. Add one under{" "}
            <Link href="/banking" className="text-primary hover:underline">
              Banking
            </Link>{" "}
            first (Foreign currency wallet).
          </p>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </div>
      )}

      {entityId && !loading && !loadError && accounts.length > 0 && selected && selectedCurrency && (
        <div className="space-y-4">
          <div
            className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1"
            role="group"
            aria-label="Currency"
          >
            {accounts.map((account) => {
              const label = fxWalletToggleLabel(account.currency);
              const active = account.id === selectedId;
              return (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 min-w-[3rem] flex-1 items-center justify-center rounded px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                  onClick={() => setSelectedId(account.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <FxPurchaseFormFields
            fxAccountId={selected.id}
            currency={selectedCurrency}
            onClose={handleClose}
          />
        </div>
      )}
    </Dialog>
  );
}
