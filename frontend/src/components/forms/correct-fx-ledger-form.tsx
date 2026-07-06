"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import type { FxLedgerEntryRead } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
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

export type CorrectableFxSpendRow = Pick<
  FxLedgerEntryRead,
  | "journal_entry_id"
  | "movement_date"
  | "movement_type"
  | "native_quantity"
  | "try_cost_kurus"
  | "description"
  | "journal_source"
  | "fx_money_account_id"
>;

type Props = {
  open: boolean;
  currency: string;
  entry: CorrectableFxSpendRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectFxLedgerForm({
  open,
  currency,
  entry,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccountOption[]>([]);
  const [tryMoneyAccountId, setTryMoneyAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [nativeText, setNativeText] = useState("");
  const [tryReceivedText, setTryReceivedText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isConversion = entry?.journal_source === "fx_conversion";

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [payments, expenses] = await Promise.all([
      loadBankAndCashAccounts(entityId),
      apiFetch<{ items: ExpenseAccountOption[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ).then((chart) => chart.items.filter((a) => a.code.startsWith("5"))),
    ]);
    setTryAccounts(payments);
    setExpenseAccounts(expenses);
    if (payments[0]) setTryMoneyAccountId(payments[0].id);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !entry) return;
    void loadOptions().catch(() => undefined);
    setDateText(formatTrDate(entry.movement_date));
    setNativeText(formatFxNative(Math.abs(entry.native_quantity), currency));
    setTryReceivedText(formatKurus(Math.abs(entry.try_cost_kurus)));
    setDescription(entry.description);
    setReason("");
    setError(null);
  }, [open, entry, currency, loadOptions]);

  const nativeQuantity = parseFxNative(nativeText);
  const tryReceivedKurus = parseTryToKurus(tryReceivedText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) return;
    const entryDate = parseTrDate(dateText);
    if (!entryDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (nativeQuantity === null || nativeQuantity <= 0) {
      setError("Enter a valid FX amount.");
      return;
    }
    if (isConversion && (tryReceivedKurus === null || tryReceivedKurus <= 0)) {
      setError("Enter valid TRY received.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/fx/ledger/${entry.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  entry_date: entryDate,
                  native_quantity: nativeQuantity,
                  try_received_kurus: isConversion ? tryReceivedKurus : null,
                  fx_money_account_id: entry.fx_money_account_id,
                  try_money_account_id: isConversion ? tryMoneyAccountId : null,
                  expense_account_id: isConversion ? null : expenseAccountId,
                  description: description.trim() || entry.description,
                  actor_id: actorId,
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
      toast("FX entry corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit FX entry" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cfx-date">Date</Label>
            <DateInput id="cfx-date" value={dateText} onChange={setDateText} required />
          </div>
          <div>
            <Label htmlFor="cfx-native">{currency} amount</Label>
            <Input
              id="cfx-native"
              value={nativeText}
              onChange={(e) => setNativeText(e.target.value)}
              required
            />
          </div>
          {isConversion ? (
            <>
              <div>
                <Label htmlFor="cfx-try">TRY received</Label>
                <MoneyInput
                  id="cfx-try"
                  value={tryReceivedText}
                  onChange={setTryReceivedText}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cfx-bank">Receive into</Label>
                <Combobox
                  id="cfx-bank"
                  value={tryMoneyAccountId}
                  onValueChange={setTryMoneyAccountId}
                  options={tryAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.account_kind})`,
                  }))}
                  placeholder="TRY account…"
                />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="cfx-expense">Expense account</Label>
              <Combobox
                id="cfx-expense"
                value={expenseAccountId}
                onValueChange={setExpenseAccountId}
                options={expenseAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                }))}
                placeholder="Expense account…"
              />
            </div>
          )}
          <div>
            <Label htmlFor="cfx-desc">Description</Label>
            <Input
              id="cfx-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cfx-reason">Edit reason (optional)</Label>
            <Input id="cfx-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
