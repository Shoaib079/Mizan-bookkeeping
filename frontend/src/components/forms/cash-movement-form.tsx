"use client";

/** Cash drawer movement — Phase 9 Slice 4 / 11.13 optional session. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  mergeExpenseAccounts,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCashAccountId?: string;
  onSaved?: () => void;
};

export function CashMovementForm({
  open,
  onClose,
  defaultCashAccountId,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [offsetAccounts, setOffsetAccounts] = useState<ChartAccount[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [offsetAccountId, setOffsetAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Cash drawer movement");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!entityId) return;
    const [cashRes, chartRes] = await Promise.all([
      apiFetch<{ items: MoneyAccountLeaf[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: ChartAccount[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setCashAccounts(cashRes.items.filter((a) => a.is_active));
    const pickable = filterExpenseAccounts(chartRes.items);
    setOffsetAccounts(pickable);
    if (defaultCashAccountId) setMoneyAccountId(defaultCashAccountId);
    else if (cashRes.items[0]) setMoneyAccountId(cashRes.items[0].id);
    if (pickable[0]) setOffsetAccountId(pickable[0].id);
  }, [entityId, defaultCashAccountId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadData().catch(() => undefined);
    }
  }, [open, loadData]);

  const amountKurus = parseTryToKurus(amountText);
  const amountInvalid =
    amountText.trim() !== "" &&
    (amountKurus === null || amountKurus <= 0);
  const submitBlocked = amountKurus === null || amountKurus <= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const movementDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!movementDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) => {
        await apiFetch(`/entities/${entityId}/cash/movements`, {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            withPeriodUnlockReason(
              {
                money_account_id: moneyAccountId,
                movement_date: movementDate,
                direction,
                amount_kurus: amountKurus,
                offset_account_id: offsetAccountId,
                description,
                actor_id: actorId,
              },
              periodUnlockReason,
            ),
          ),
        });
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Cash movement saved");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Movement failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Cash drawer movement" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cash-date">Date (DD.MM.YYYY)</Label>
            <DateInput
              id="cash-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Posts to the cash account immediately. An EOD drawer session is optional
            — use Close drawer day when you want to reconcile a count.
          </p>
          <div>
            <Label htmlFor="cash-acct">Cash account</Label>
            <Combobox
              id="cash-acct"
              value={moneyAccountId}
              onValueChange={setMoneyAccountId}
              options={cashAccounts.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              placeholder="Cash account…"
            />
          </div>
          <div>
            <Label htmlFor="cash-dir">Direction</Label>
            <Select
              id="cash-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="in">Cash in</option>
              <option value="out">Cash out</option>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="cash-offset">Offset account (expense)</Label>
              {entityId && (
                <AddExpenseCategoryButton
                  entityId={entityId}
                  onCreated={async (account) => {
                    setOffsetAccounts((prev) => mergeExpenseAccounts(prev, account));
                    setOffsetAccountId(account.id);
                  }}
                />
              )}
            </div>
            <Combobox
              id="cash-offset"
              value={offsetAccountId}
              onValueChange={setOffsetAccountId}
              options={offsetAccounts.map((a) => ({
                value: a.id,
                label: formatExpenseAccountLabel(a),
              }))}
              placeholder="Expense account…"
            />
          </div>
          <div>
            <Label htmlFor="cash-amount">Amount (TRY)</Label>
            <MoneyInput
              id="cash-amount"
              placeholder="500,00"
              value={amountText}
              onChange={setAmountText}
              showPreview={false}
              showInvalidHint={false}
              required
            />
            {amountInvalid && (
              <ValidationHint>Enter an amount greater than zero.</ValidationHint>
            )}
          </div>
          <div>
            <Label htmlFor="cash-desc">Description</Label>
            <Input
              id="cash-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || submitBlocked}>
            {submitting ? "Recording…" : "Record movement"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
