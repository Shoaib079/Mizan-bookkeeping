"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { useToast } from "@/lib/toast";

type Props = {
  open: boolean;
  customerId: string;
  balanceKurus: number;
  onClose: () => void;
  onSaved?: () => void;
};

function defaultAmount(minor: number): string {
  return (minor / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Write off part or all of an agency's outstanding receivable balance to 5800. */
export function CustomerWriteOffDialog({
  open,
  customerId,
  balanceKurus,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [amountText, setAmountText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setAmountText(defaultAmount(balanceKurus));
    }
  }, [open, balanceKurus]);

  async function onSubmit() {
    if (!entityId) return;
    const kurus = parseTryToKurus(amountText);
    if (kurus === null || kurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (kurus > balanceKurus) {
      setError("Amount exceeds the receivable balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/customers/${customerId}/write-off`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          write_off_date: parseTrDate(todayTrDate()),
          amount_kurus: kurus,
          description: "Receivable write-off",
          actor_id: actorId,
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
    <FormDialogShell open={open} title="Write off receivable" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Receivable balance: {formatTry(balanceKurus)}
        </p>
        <div>
          <Label htmlFor="wo-amt">Amount to write off (₺)</Label>
          <MoneyInput
            id="wo-amt"
            value={amountText}
            onChange={setAmountText}
            placeholder="0,00"
          />
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
    </FormDialogShell>
  );
}
