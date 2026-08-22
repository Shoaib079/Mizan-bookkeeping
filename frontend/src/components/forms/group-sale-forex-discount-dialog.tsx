"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import { useToast } from "@/lib/toast";

type Props = {
  open: boolean;
  groupSaleId: string;
  forexCurrency: string;
  remainingForexMinor: number;
  onClose: () => void;
  onSaved?: () => void;
};

function defaultNative(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Native discount on a forex-only group sale — subledger only, no TRY. */
export function GroupSaleForexDiscountDialog({
  open,
  groupSaleId,
  forexCurrency,
  remainingForexMinor,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
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

  async function onSubmit() {
    if (!entityId) return;
    const native = parseFxNative(amountText);
    if (native === null || native <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (native > remainingForexMinor) {
      setError("Discount exceeds the outstanding balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/group-sales/${groupSaleId}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_kurus: 0,
          discount_native: native,
          description: note.trim() || "Group sale discount",
          actor_id: actorId,
        }),
      });
      toast("Discount recorded");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell open={open} title="Apply discount" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Reduces the {forexCurrency} receivable — no TRY until conversion.
        </p>
        <p className="text-sm text-muted-foreground">
          Outstanding: {formatFxNative(remainingForexMinor, forexCurrency)}
        </p>
        <div className="space-y-2">
          <Label htmlFor="discount-native">Discount amount ({forexCurrency})</Label>
          <MoneyInput
            id="discount-native"
            value={amountText}
            onChange={setAmountText}
            placeholder={defaultNative(remainingForexMinor)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discount-note">Note (optional)</Label>
          <input
            id="discount-note"
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
