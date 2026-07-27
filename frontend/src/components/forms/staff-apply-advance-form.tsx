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
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  /** Current outstanding advance (kuruş) — shown as context + default apply. */
  outstandingAdvanceMinor: number;
  embedded?: boolean;
  onSaved?: () => void;
};

/**
 * Apply an outstanding advance against salary owed — NO cash moves.
 * Dr Salaries Payable / Cr 1300 Employee Advances. Nets the advance against
 * everything unpaid, regular salary AND extra days (BUGLOG 2026-07-13).
 */
export function StaffApplyAdvanceForm({
  open,
  onClose,
  employeeId,
  outstandingAdvanceMinor,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Advance applied to salary");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      submitIdempotency.resetSubmit();
      setDateText(todayTrDate());
      setAmountText("");
      setDescription("Advance applied to salary");
      setError(null);
    }
  }, [open, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) return;
    const appliedDate = parseTrDate(dateText);
    if (!appliedDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    // Empty amount = apply the maximum (min of advance and salary owed).
    let amountMinor: number | null = null;
    if (amountText.trim() !== "") {
      amountMinor = parseTryToKurus(amountText);
      if (amountMinor === null || amountMinor <= 0) {
        setError("Enter a valid amount, or leave empty to apply the maximum.");
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/apply-advance`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applied_date: appliedDate,
            description,
            actor_id: actorId,
            amount_minor: amountMinor,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Advance applied to salary");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Apply advance to salary owed"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Nets the outstanding advance ({formatTry(outstandingAdvanceMinor)})
          against unpaid salary — including extra days. No cash moves.
        </p>
        <div>
          <Label htmlFor="apa-date">Date (DD.MM.YYYY)</Label>
          <DateInput id="apa-date" value={dateText} onChange={setDateText} required />
        </div>
        <div>
          <Label htmlFor="apa-amount">Amount (₺) — optional</Label>
          <MoneyInput
            id="apa-amount"
            placeholder="Leave empty to apply the maximum"
            value={amountText}
            onChange={setAmountText}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Empty applies the maximum: the smaller of the outstanding advance
            and the salary still owed.
          </p>
        </div>
        <div>
          <Label htmlFor="apa-desc">Description</Label>
          <Input
            id="apa-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Applying…" : "Apply advance"}
          </Button>
        </div>
      </form>
    </FormDialogShell>
  );
}
