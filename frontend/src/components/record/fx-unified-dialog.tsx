"use client";

/** Add hub — buy, sell, and spend foreign currency in one dialog. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FxConversionForm } from "@/components/forms/fx-conversion-form";
import { FxExpenseSpendForm } from "@/components/forms/fx-expense-spend-form";
import { FxPurchaseFormFields } from "@/components/forms/fx-purchase-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  loadAllForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { fxWalletToggleLabel } from "@/lib/fx-purchase-helpers";
import { useEntity } from "@/lib/entity-context";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type FxUnifiedMode = "buy" | "sell" | "spend";

type Props = {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  onSaved?: () => void;
  initialMode?: FxUnifiedMode;
};

const MODE_ORDER: readonly FxUnifiedMode[] = ["buy", "sell", "spend"];

const MODE_LABELS: Record<FxUnifiedMode, string> = {
  buy: "Buy",
  sell: "Sell",
  spend: "Spend",
};

export function FxUnifiedDialog({
  open,
  onClose,
  embedded = false,
  onSaved,
  initialMode = "buy",
}: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<FxUnifiedMode>(initialMode);

  const reset = useCallback(() => {
    setAccounts([]);
    setLoadError(null);
    setSelectedId("");
    setLoading(false);
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setMode(initialMode);
    if (!entityId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadAllForeignCurrencyAccounts(entityId)
      .then((items) => {
        if (cancelled) return;
        setAccounts(items);
        if (items[0]) setSelectedId(items[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load FX accounts",
        );
        setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, initialMode, reset]);

  const selected = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const selectedCurrency = selected?.currency
    ? fxWalletToggleLabel(selected.currency)
    : null;

  function handleClose() {
    reset();
    if (!embedded) onClose();
  }

  function handleSaved() {
    onSaved?.();
    if (!embedded) handleClose();
  }

  if (!open) return null;

  const panelBody = (
    <>
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
            first.
          </p>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </div>
      )}

      {entityId && !loading && !loadError && accounts.length > 0 && selected && selectedCurrency && (
        <div className="space-y-4">
          <SegmentedControl
            role="tablist"
            ariaLabel="FX action"
            options={MODE_ORDER.map((entry) => ({
              value: entry,
              label: MODE_LABELS[entry],
            }))}
            value={mode}
            onChange={setMode}
          />

          <SegmentedControl
            ariaLabel="Currency"
            options={accounts.map((account) => ({
              value: account.id,
              label: fxWalletToggleLabel(account.currency ?? ""),
            }))}
            value={selectedId}
            onChange={setSelectedId}
          />

          <div key={`${selected.id}-${mode}`} className="border-t border-border pt-4">
            {mode === "buy" && (
              <FxPurchaseFormFields
                fxAccountId={selected.id}
                currency={selectedCurrency}
                onClose={handleSaved}
              />
            )}
            {mode === "sell" && (
              <FxConversionForm
                embedded
                open
                fxAccountId={selected.id}
                currency={selectedCurrency}
                onClose={handleSaved}
                onSaved={onSaved}
              />
            )}
            {mode === "spend" && (
              <FxExpenseSpendForm
                embedded
                open
                fxAccountId={selected.id}
                currency={selectedCurrency}
                onClose={handleSaved}
                onSaved={onSaved}
              />
            )}
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return panelBody;

  return (
    <Dialog open={open} title="FX" onClose={handleClose}>
      {panelBody}
    </Dialog>
  );
}
