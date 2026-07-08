"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTry, parseTryToKurus } from "@/lib/money";
import { useToast } from "@/lib/toast";

type Props = {
  open: boolean;
  saleId: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

function defaultAmount(minor: number): string {
  return (minor / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Write off part (or all) of a group sale's unpaid remainder to 5800 Sales Discounts. */
export function GroupSaleDiscountDialog({ open, saleId, onClose, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [sale, setSale] = useState<GroupSaleRead | null>(null);
  const [amountText, setAmountText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId || !saleId) return;
    const s = await apiFetch<GroupSaleRead>(
      `/entities/${entityId}/group-sales/${saleId}`,
    );
    setSale(s);
    if (s.forex_currency && s.remaining_forex_minor != null) {
      setAmountText(defaultAmount(s.remaining_forex_minor));
    } else {
      setAmountText(defaultAmount(s.remaining_kurus ?? s.total_kurus));
    }
  }, [entityId, saleId]);

  useEffect(() => {
    if (open) {
      setError(null);
      setSale(null);
      setAmountText("");
      void load().catch(() => setError("Could not load the sale."));
    }
  }, [open, load]);

  const isForex = Boolean(sale?.forex_currency);
  const remainingKurus = sale ? sale.remaining_kurus ?? sale.total_kurus : 0;
  const remainingNative = sale?.remaining_forex_minor ?? null;

  async function onSubmit() {
    if (!entityId || !sale || !saleId) return;
    let discountKurus: number;
    let discountNative: number | undefined;

    if (isForex && remainingNative != null && remainingNative > 0) {
      const native = parseFxNative(amountText);
      if (native === null || native <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      if (native > remainingNative) {
        setError("Amount exceeds the remaining balance.");
        return;
      }
      discountNative = native;
      discountKurus = Math.round((native * remainingKurus) / remainingNative);
    } else {
      const kurus = parseTryToKurus(amountText);
      if (kurus === null || kurus <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      if (kurus > remainingKurus) {
        setError("Amount exceeds the remaining balance.");
        return;
      }
      discountKurus = kurus;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/group-sales/${saleId}/discount`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_kurus: discountKurus,
          discount_native: discountNative,
          description: "Group sale discount (write-off)",
        }),
      });
      toast("Write-off recorded");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write-off failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell open={open} title="Write off remaining" onClose={onClose}>
      {!sale ? (
        <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Remaining:{" "}
            {isForex && remainingNative != null && sale.forex_currency
              ? `${formatFxNative(remainingNative, sale.forex_currency)} (${formatTry(remainingKurus)})`
              : formatTry(remainingKurus)}
          </p>
          <div>
            <Label htmlFor="disc-amt">
              Amount to write off {isForex ? `(${sale.forex_currency})` : "(₺)"}
            </Label>
            {isForex ? (
              <Input
                id="disc-amt"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0,00"
              />
            ) : (
              <MoneyInput
                id="disc-amt"
                value={amountText}
                onChange={setAmountText}
                placeholder="0,00"
              />
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void onSubmit()}>
              {submitting ? "Recording…" : "Write off"}
            </Button>
          </div>
        </div>
      )}
    </FormDialogShell>
  );
}
