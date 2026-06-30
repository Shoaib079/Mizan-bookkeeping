"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  payCurrency: string;
  embedded?: boolean;
  onSaved?: () => void;
};

export function StaffAccrualForm({
  open,
  onClose,
  employeeId,
  payCurrency,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const isTry = payCurrency === "TRY";
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Salary accrual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setDateText(todayTrDate());
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountMinor = isTry
      ? parseTryToKurus(amountText)
      : parseFxNative(amountText);
    const accrualDate = parseTrDate(dateText);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!accrualDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/accruals`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accrual_date: accrualDate,
            amount_minor: amountMinor,
            description,
            actor_id: actorId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Salary accrued");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accrual failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Salary accrual"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Accrues salary payable ({payCurrency}). No cash movement.
        </p>
        <div>
          <Label htmlFor="acc-date">Accrual date (DD.MM.YYYY)</Label>
          <DateInput
            id="acc-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="acc-amount">Amount ({payCurrency})</Label>
          {isTry ? (
            <MoneyInput
              id="acc-amount"
              placeholder="15.000,00"
              value={amountText}
              onChange={setAmountText}
              required
            />
          ) : (
            <Input
              id="acc-amount"
              placeholder="1.000,00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              required
            />
          )}
        </div>
        <div>
          <Label htmlFor="acc-desc">Description</Label>
          <Input
            id="acc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record accrual"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
