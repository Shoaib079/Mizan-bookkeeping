"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import {
  formatKurus,
  formatTrDate,
  formatTry,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableStaffLedgerRow = {
  journal_entry_id: string;
  movement_date: string;
  movement_type: string;
  amount_minor: number;
  description: string;
  /** GL account an advance/salary was paid from — restores the picker. */
  payment_account_id?: string | null;
  /** Days worked on an extra-days row — restores days × rate. */
  extra_days?: number | null;
};

type Props = {
  open: boolean;
  employeeId: string;
  entry: CorrectableStaffLedgerRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectStaffLedgerForm({
  open,
  employeeId,
  entry,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [paymentAccounts, setPaymentAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [daysText, setDaysText] = useState("");
  const [perDayText, setPerDayText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsPaymentAccount =
    entry?.movement_type === "advance_paid" ||
    entry?.movement_type === "salary_payment" ||
    entry?.movement_type === "extra_days_paid";
  const isExtraDays =
    entry?.movement_type === "extra_days_accrued" ||
    entry?.movement_type === "extra_days_paid";

  const loadAccounts = useCallback(
    async (recorded: CorrectableStaffLedgerRow) => {
      if (!entityId) return;
      const merged = await loadBankAndCashAccounts(entityId);
      setPaymentAccounts(merged);
      // Restore the account the payment was actually paid from.
      const chosen =
        (recorded.payment_account_id &&
          merged.find((a) => a.gl_account_id === recorded.payment_account_id)) ||
        merged[0];
      setPaymentGlAccountId(chosen?.gl_account_id ?? "");
    },
    [entityId],
  );

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !entry) return;
    setDateText(formatTrDate(entry.movement_date));
    setAmountText(formatKurus(Math.abs(entry.amount_minor)));
    setDescription(entry.description);
    // Extra-days rows reopen as days × rate, exactly as recorded.
    const days = entry.extra_days ?? null;
    setDaysText(days ? String(days) : "");
    setPerDayText(
      days && days > 0
        ? formatKurus(Math.round(Math.abs(entry.amount_minor) / days))
        : "",
    );
    setReason("");
    setError(null);
    void loadAccounts(entry).catch(() => undefined);
  }, [open, entry, loadAccounts]);

  const parsedDays = Number.parseInt(daysText, 10);
  const extraDaysValue = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null;
  const perDayMinor = parseTryToKurus(perDayText);
  // For extra days the total is always days × rate, so the two can never drift.
  const extraDaysTotalMinor =
    isExtraDays && extraDaysValue !== null && perDayMinor !== null && perDayMinor > 0
      ? extraDaysValue * perDayMinor
      : null;
  const amountMinor = isExtraDays ? extraDaysTotalMinor : parseTryToKurus(amountText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) return;
    const entryDate = parseTrDate(dateText);
    if (!entryDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (isExtraDays && amountMinor === null) {
      setError("Enter the days worked and the pay per day.");
      return;
    }
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/staff/employees/${employeeId}/ledger/${entry.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  entry_date: entryDate,
                  amount_minor: amountMinor,
                  description: description.trim() || entry.description,
                  actor_id: actorId,
                  payment_account_id: needsPaymentAccount ? paymentGlAccountId : null,
                  extra_days: isExtraDays ? extraDaysValue : null,
                  per_day_minor: isExtraDays ? perDayMinor : null,
                  reason: reason.trim() || null,
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("Staff entry corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit staff entry" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="csl-date">Date</Label>
            <DateInput id="csl-date" value={dateText} onChange={setDateText} required />
          </div>
          {isExtraDays ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="csl-days">Days worked</Label>
                  <Input
                    id="csl-days"
                    type="number"
                    min={1}
                    max={31}
                    value={daysText}
                    onChange={(e) => setDaysText(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="csl-perday">Pay per day (₺)</Label>
                  <MoneyInput
                    id="csl-perday"
                    value={perDayText}
                    onChange={setPerDayText}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {extraDaysTotalMinor === null
                    ? "—"
                    : formatTry(extraDaysTotalMinor)}
                </span>{" "}
                — days × pay per day.
              </p>
            </>
          ) : (
            <div>
              <Label htmlFor="csl-amount">Amount (TRY)</Label>
              <MoneyInput id="csl-amount" value={amountText} onChange={setAmountText} required />
            </div>
          )}
          {needsPaymentAccount && (
            <div>
              <Label htmlFor="csl-pay">Pay from</Label>
              <Combobox
                id="csl-pay"
                value={paymentGlAccountId}
                onValueChange={setPaymentGlAccountId}
                options={paymentAccounts.map((a) => ({
                  value: a.gl_account_id,
                  label: `${a.name} (${a.account_kind})`,
                }))}
                placeholder="Cash or bank…"
              />
            </div>
          )}
          <div>
            <Label htmlFor="csl-desc">Description</Label>
            <Input
              id="csl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="csl-reason">Edit reason (optional)</Label>
            <Input id="csl-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || amountMinor === null || amountMinor <= 0}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
