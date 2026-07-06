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
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
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
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsPaymentAccount =
    entry?.movement_type === "advance_paid" ||
    entry?.movement_type === "salary_payment";

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadBankAndCashAccounts(entityId);
    setPaymentAccounts(merged);
    if (merged[0]) setPaymentGlAccountId(merged[0].gl_account_id);
  }, [entityId]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !entry) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(entry.movement_date));
    setAmountText(formatKurus(Math.abs(entry.amount_minor)));
    setDescription(entry.description);
    setReason("");
    setError(null);
  }, [open, entry, loadAccounts]);

  const amountMinor = parseTryToKurus(amountText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) return;
    const entryDate = parseTrDate(dateText);
    if (!entryDate) {
      setError("Date must be DD.MM.YYYY.");
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
          <div>
            <Label htmlFor="csl-amount">Amount (TRY)</Label>
            <MoneyInput id="csl-amount" value={amountText} onChange={setAmountText} required />
          </div>
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
