"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import {
  fetchExpenseAccounts,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { useEntity } from "@/lib/entity-context";
import {
  defaultMainDrawerId,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEditFormDirty } from "@/lib/use-form-dirty";

type ExpenseAccountOption = ChartAccount;

export type CorrectablePartnerLedgerRow = {
  journal_entry_id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  /** GL account a reimbursement was paid from — restores the picker. */
  payment_account_id?: string | null;
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
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountOption[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [baseline, setBaseline] = useState<Record<string, string> | null>(null);

  const isExpenseFronted = entry?.movement_type === "expense_fronted";

  const loadOptions = useCallback(
    async (recorded: CorrectablePartnerLedgerRow) => {
      if (!entityId) return;
      const expenses = await fetchExpenseAccounts(entityId);
      setExpenseAccounts(expenses);
      if (expenses[0]) setExpenseAccountId(expenses[0].id);

      if (recorded.movement_type === "expense_fronted") {
        setCashAccounts([]);
        setCashAccountId("");
        return;
      }

      const cashRes = await apiFetch<{ items: MoneyAccountOption[] }>(
        `/entities/${entityId}/banking/accounts?limit=100`,
      );
      const accounts = cashRes.items;
      setCashAccounts(accounts);
      const drawerId = defaultMainDrawerId(accounts);
      const restored =
        (recorded.payment_account_id
          ? accounts.find(
              (a) => a.gl_account_id === recorded.payment_account_id,
            )
          : undefined) ??
        (drawerId ? accounts.find((a) => a.id === drawerId) : undefined) ??
        accounts[0];
      setCashAccountId(restored?.id ?? "");
    },
    [entityId],
  );

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !entry) {
      setBaseline(null);
      return;
    }
    setDateText(formatTrDate(entry.movement_date));
    setAmountText(formatKurus(Math.abs(entry.amount_kurus)));
    setDescription(entry.description);
    setReason("");
    setError(null);
    setBaseline(null);
    void loadOptions(entry).catch(() => undefined);
  }, [open, entry, loadOptions]);

  useEffect(() => {
    if (!open || !entry || baseline !== null) return;
    if (!isExpenseFronted && cashAccounts.length === 0) return;
    if (isExpenseFronted && expenseAccounts.length === 0) return;
    setBaseline({
      dateText,
      amountText,
      description,
      reason,
      expenseAccountId,
      cashAccountId,
    });
  }, [
    open,
    entry,
    baseline,
    isExpenseFronted,
    cashAccounts.length,
    expenseAccounts.length,
    dateText,
    amountText,
    description,
    reason,
    expenseAccountId,
    cashAccountId,
  ]);

  const amountKurus = parseTryToKurus(amountText);
  const { dirty, markTouched } = useEditFormDirty(
    "correct-partner-ledger",
    open && entry !== null,
    baseline,
    {
      dateText,
      amountText,
      description,
      reason,
      expenseAccountId,
      cashAccountId,
    },
  );

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
    const paymentAccount = cashAccounts.find((a) => a.id === cashAccountId);
    if (!isExpenseFronted && !paymentAccount) {
      setError("Choose a money account.");
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
                  payment_account_id: isExpenseFronted
                    ? null
                    : paymentAccount!.gl_account_id,
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
      <Dialog open={open} title="Edit partner entry" onClose={onClose} dirty={dirty}>
        <form onSubmit={onSubmit} onChange={markTouched} className="space-y-3">
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
                  label: formatExpenseAccountLabel(a),
                }))}
                placeholder="Expense account…"
              />
            </div>
          ) : (
            <CashDrawerPicker
              id="cpl-pay"
              accounts={cashAccounts}
              value={cashAccountId}
              onValueChange={setCashAccountId}
              label="Money account"
            />
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
