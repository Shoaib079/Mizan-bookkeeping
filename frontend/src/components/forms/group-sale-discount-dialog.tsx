"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import {
  groupSaleDiscountMode,
  tryDiscountFromNativeAtSaleRate,
  type GroupSaleDiscountMode,
} from "@/lib/group-sale-discount";
import type { GroupSaleRead } from "@/lib/group-sales-types";
import { formatTry, parseTryToKurus } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";

type Props = {
  open: boolean;
  sale: Pick<
    GroupSaleRead,
    | "id"
    | "currency"
    | "forex_currency"
    | "fx_rate_used"
    | "total_kurus"
    | "remaining_kurus"
    | "remaining_forex_minor"
  >;
  onClose: () => void;
  onSaved?: () => void;
};

function defaultFx(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function helperCopy(mode: GroupSaleDiscountMode, forexCurrency: string | null): string {
  if (mode === "forex_only") {
    return `Reduces the ${forexCurrency} receivable — no TRY until conversion.`;
  }
  if (mode === "rated_fx") {
    return `Discount in ${forexCurrency}; TRY equivalent uses the sale-date rate.`;
  }
  return "Posts to Sales Discounts (5800) and reduces the TRY receivable.";
}

/** Apply discount on any group sale type while outstanding remains. */
export function GroupSaleDiscountDialog({ open, sale, onClose, onSaved }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const mode = groupSaleDiscountMode(sale);
  const forexCurrency = sale.forex_currency ?? sale.currency;

  const outstandingMinor = useMemo(() => {
    if (mode === "try") return sale.remaining_kurus ?? 0;
    return sale.remaining_forex_minor ?? 0;
  }, [mode, sale.remaining_forex_minor, sale.remaining_kurus]);

  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setAmountText("");
      setNote("");
    }
  }, [open]);

  const tryEcho = useMemo(() => {
    if (mode !== "rated_fx" || sale.fx_rate_used == null) return null;
    const native = parseFxNative(amountText);
    if (native == null || native <= 0) return null;
    return tryDiscountFromNativeAtSaleRate(native, sale.fx_rate_used);
  }, [amountText, mode, sale.fx_rate_used]);

  async function onSubmit() {
    if (!entityId) return;

    let discountKurus = 0;
    let discountNative: number | null = null;

    if (mode === "try") {
      const parsed = parseTryToKurus(amountText);
      if (parsed == null || parsed <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      if (parsed > outstandingMinor) {
        setError("Discount exceeds the outstanding balance.");
        return;
      }
      discountKurus = parsed;
    } else {
      const native = parseFxNative(amountText);
      if (native == null || native <= 0) {
        setError("Enter a valid amount.");
        return;
      }
      if (native > outstandingMinor) {
        setError("Discount exceeds the outstanding balance.");
        return;
      }
      discountNative = native;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/group-sales/${sale.id}/discount`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_kurus: discountKurus,
          discount_native: discountNative,
          description: note.trim() || "Group sale discount",
          actor_id: actorId,
        }),
      });
      submitIdempotency.completeSubmit();
      toast("Discount recorded");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const amountLabel =
    mode === "try"
      ? "Discount amount (TRY)"
      : `Discount amount (${forexCurrency})`;

  const outstandingLabel =
    mode === "try"
      ? formatTry(outstandingMinor)
      : formatFxNative(outstandingMinor, forexCurrency);

  return (
    <FormDialogShell open={open} title="Apply discount" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {helperCopy(mode, sale.forex_currency)}
        </p>
        <p className="text-sm text-muted-foreground">
          Outstanding: {outstandingLabel}
        </p>
        <div className="space-y-2">
          <Label htmlFor="group-sale-discount-amount">{amountLabel}</Label>
          <MoneyInput
            id="group-sale-discount-amount"
            value={amountText}
            onChange={setAmountText}
            placeholder={
              mode === "try"
                ? formatTry(outstandingMinor).replace(" ₺", "")
                : defaultFx(outstandingMinor)
            }
          />
        </div>
        {tryEcho != null && (
          <p className="text-sm text-muted-foreground">
            TRY equivalent: {formatTry(tryEcho)}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="group-sale-discount-note">Note (optional)</Label>
          <input
            id="group-sale-discount-note"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={512}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void onSubmit()}>
            {submitting ? "Saving…" : "Apply discount"}
          </Button>
        </div>
      </div>
    </FormDialogShell>
  );
}
