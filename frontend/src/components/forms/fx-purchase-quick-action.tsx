"use client";

/** New-menu FX purchase — pick wallet, then open FxPurchaseForm. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FxPurchaseForm } from "@/components/forms/fx-purchase-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import {
  loadAllForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function FxPurchaseQuickAction({ open, onClose }: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState("");

  const reset = useCallback(() => {
    setAccounts([]);
    setLoadError(null);
    setPickedId("");
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
        if (items.length === 1) {
          setPickedId(items[0]!.id);
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

  const picked =
    accounts.find((account) => account.id === pickedId) ??
    (accounts.length === 1 ? accounts[0] : null);

  if (picked?.currency) {
    return (
      <FxPurchaseForm
        open={open}
        onClose={handleClose}
        fxAccountId={picked.id}
        currency={picked.currency}
      />
    );
  }

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

      {entityId && !loading && !loadError && accounts.length > 1 && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="fx-buy-wallet">FX wallet</Label>
            <Combobox
              id="fx-buy-wallet"
              value={pickedId}
              onValueChange={setPickedId}
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.name} (${account.currency ?? "?"})`,
              }))}
              placeholder="Select currency wallet…"
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
