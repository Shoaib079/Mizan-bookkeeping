"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEditFormDirty } from "@/lib/use-form-dirty";

import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";

type MoneyAccount = { id: string; name: string };

export type CorrectableExpenseRow = {
  id: string;
  expense_date: string;
  description: string;
  written_item_description: string | null;
  notes: string | null;
  amount_kurus: number;
  expense_account_id: string;
  money_account_id: string;
  status: string;
  journal_entry_id?: string | null;
};

type Props = {
  open: boolean;
  expense: CorrectableExpenseRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectExpenseForm({
  open,
  expense,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [baseline, setBaseline] = useState<{
    dateText: string;
    itemName: string;
    amountText: string;
    expenseAccountId: string;
    moneyAccountId: string;
    description: string;
    notes: string;
  } | null>(null);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setCashAccounts(accountsRes.items);
    setExpenseAccounts(filterExpenseAccounts(chartRes.items));
  }, [entityId]);

  useEffect(() => {
    if (!open || !expense) {
      setBaseline(null);
      return;
    }
    void loadOptions().catch(() => undefined);
    const snapshot = {
      dateText: formatTrDate(expense.expense_date),
      itemName: expense.written_item_description ?? "",
      amountText: formatKurus(Math.abs(expense.amount_kurus)),
      description: expense.description,
      notes: expense.notes ?? "",
      expenseAccountId: expense.expense_account_id,
      moneyAccountId: expense.money_account_id,
    };
    setDateText(snapshot.dateText);
    setAmountText(snapshot.amountText);
    setItemName(snapshot.itemName);
    setDescription(snapshot.description);
    setNotes(snapshot.notes);
    setExpenseAccountId(snapshot.expenseAccountId);
    setMoneyAccountId(snapshot.moneyAccountId);
    setBaseline(snapshot);
    setError(null);
  }, [open, expense, loadOptions]);

  useEffect(() => {
    if (open && expense && cashAccounts.length > 0 && !moneyAccountId) {
      setMoneyAccountId(expense.money_account_id || cashAccounts[0]?.id || "");
    }
  }, [open, expense, cashAccounts, moneyAccountId]);

  const amountKurus = parseTryToKurus(amountText);
  const submitBlocked =
    !expense ||
    !expenseAccountId ||
    !moneyAccountId ||
    amountKurus === null ||
    amountKurus <= 0;

  const { dirty, markTouched } = useEditFormDirty(
    "correct-expense",
    open && expense !== null,
    baseline,
    {
      dateText,
      itemName,
      amountText,
      expenseAccountId,
      moneyAccountId,
      description,
      notes,
    },
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !expense) {
      setError("Select a restaurant and expense first.");
      return;
    }
    const expenseDate = parseTrDate(dateText);
    if (!expenseDate) {
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
      const result = await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch<{ expense: { status: string } }>(
          `/entities/${entityId}/expenses/${expense.id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  expense_date: expenseDate,
                  amount_kurus: amountKurus,
                  expense_account_id: expenseAccountId,
                  money_account_id: moneyAccountId,
                  written_item_description: itemName.trim() || null,
                  has_source_document: false,
                  description:
                    description.trim() || itemName.trim() || "Manual expense",
                  notes: notes.trim() || null,
                  actor_id: actorId,
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();

      if (result.expense.status !== "posted") {
        setError(
          `Unexpected status "${result.expense.status}". Check the Expenses list before trying again.`,
        );
        return;
      }

      onClose();
      onSaved();
      toast("Expense corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <Dialog open={open} title="Edit expense" onClose={onClose} dirty={dirty}>
      <form onSubmit={onSubmit} onChange={markTouched} className="space-y-3">
        <div>
          <Label htmlFor="correct-exp-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="correct-exp-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="correct-exp-item">Item name</Label>
          <Input
            id="correct-exp-item"
            placeholder="peynir"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="correct-exp-amount">Amount (TRY)</Label>
          <MoneyInput
            id="correct-exp-amount"
            placeholder="150,00"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="correct-exp-account">Expense account</Label>
          <Select
            id="correct-exp-account"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {formatExpenseAccountLabel(a)}
              </option>
            ))}
          </Select>
        </div>
        <CashDrawerPicker
          id="correct-exp-drawer"
          accounts={cashAccounts}
          value={moneyAccountId}
          onValueChange={setMoneyAccountId}
        />
        <div>
          <Label htmlFor="correct-exp-description">Description</Label>
          <Input
            id="correct-exp-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="correct-exp-notes">Notes (optional)</Label>
          <Textarea
            id="correct-exp-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Receipt #, who paid, anything extra…"
            maxLength={512}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Saving…" : "Save correction"}
        </Button>
      </form>
    </Dialog>
    <PeriodUnlockDialog />
    </>
  );
}
