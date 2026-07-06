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

type ExpenseAccountOption = { id: string; code: string; name: string };

export type CorrectablePartnerLedgerRow = {
  journal_entry_id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  partnerId: string;
  entry: CorrectablePartnerLedgerRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectPartnerLedgerForm({
  open,
  partnerId,
  entry,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccountOption[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<MoneyAccountOption[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isExpenseFronted = entry?.movement_type === "expense_fronted";

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [expenses, payments] = await Promise.all([
      apiFetch<{ items: ExpenseAccountOption[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ).then((chart) => chart.items.filter((a) => a.code.startsWith("5"))),
      loadBankAndCashAccounts(entityId),
    ]);
    setExpenseAccounts(expenses);
    setPaymentAccounts(payments);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
    if (payments[0]) setPaymentGlAccountId(payments[0].gl_account_id);
  }, [entityId]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !entry) return;
    void loadOptions().catch(() => undefined);
    setDateText(formatTrDate(entry.movement_date));
    setAmountText(formatKurus(Math.abs(entry.amount_kurus)));
    setDescription(entry.description);
    setReason("");
    setError(null);
  }, [open, entry, loadOptions]);

  const amountKurus = parseTryToKurus(amountText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) return;
    const entryDate = parseTrDate(dateText);
    if (!entryDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/partners/${partnerId}/ledger/${entry.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  entry_date: entryDate,
                  amount_kurus: amountKurus,
                  description: description.trim() || entry.description,
                  actor_id: actorId,
                  expense_account_id: isExpenseFronted ? expenseAccountId : null,
                  payment_account_id: isExpenseFronted ? null : paymentGlAccountId,
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
      toast("Partner entry corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit partner entry" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cpl-date">Date</Label>
            <DateInput id="cpl-date" value={dateText} onChange={setDateText} required />
          </div>
          <div>
            <Label htmlFor="cpl-amount">Amount (TRY)</Label>
            <MoneyInput id="cpl-amount" value={amountText} onChange={setAmountText} required />
          </div>
          {isExpenseFronted ? (
            <div>
              <Label htmlFor="cpl-expense">Expense account</Label>
              <Combobox
                id="cpl-expense"
                value={expenseAccountId}
                onValueChange={setExpenseAccountId}
                options={expenseAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                }))}
                placeholder="Expense account…"
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="cpl-pay">Pay from</Label>
              <Combobox
                id="cpl-pay"
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
            <Label htmlFor="cpl-desc">Description</Label>
            <Input
              id="cpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cpl-reason">Edit reason (optional)</Label>
            <Input id="cpl-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || amountKurus === null || amountKurus <= 0}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
