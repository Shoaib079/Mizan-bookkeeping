"use client";

/** Cash drawer movement — Phase 9 Slice 4 / 11.13 optional session. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AddExpenseCategoryButton } from "@/components/forms/add-expense-category-button";
import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
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
  filterRevenueAccounts,
  formatExpenseAccountLabel,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
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
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
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
    setChartAccounts(chartRes.items);
    if (defaultCashAccountId) setMoneyAccountId(defaultCashAccountId);
    else {
      const drawerId = defaultMainDrawerId(
        cashRes.items.map((a) => ({
          id: a.id,
          gl_account_id: "",
          name: a.name,
          account_kind: a.account_kind,
        })),
      );
      if (drawerId) setMoneyAccountId(drawerId);
      else if (cashRes.items[0]) setMoneyAccountId(cashRes.items[0].id);
    }
  }, [entityId, defaultCashAccountId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadData().catch(() => undefined);
    }
  }, [open, loadData]);

  // Cash in posts Dr cash / Cr offset, so the offset must be income; cash out
  // posts Dr offset / Cr cash, so it must be an expense. Offering the wrong
  // side let you credit an expense on a cash-in — a refund, not income.
  const offsetAccounts = useMemo(
    () =>
      direction === "in"
        ? filterRevenueAccounts(chartAccounts)
        : filterExpenseAccounts(chartAccounts),
    [direction, chartAccounts],
  );

  // Keep the selection valid when the direction (and so the list) changes.
  useEffect(() => {
    if (offsetAccounts.length === 0) {
      setOffsetAccountId("");
      return;
    }
    setOffsetAccountId((current) =>
      offsetAccounts.some((a) => a.id === current) ? current : offsetAccounts[0].id,
    );
  }, [offsetAccounts]);

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
            — use Close day when you want to post a counted total and lock.
          </p>
          <CashDrawerPicker
            id="cash-acct"
            accounts={cashAccounts}
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            label="Cash account"
            placeholder="Cash account…"
          />
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
              <Label htmlFor="cash-offset">
                {direction === "in"
                  ? "Where the money came from (income)"
                  : "What it was spent on (expense)"}
              </Label>
              {/* Creates an expense category, so it only applies to cash out. */}
              {entityId && direction === "out" && (
                <AddExpenseCategoryButton
                  entityId={entityId}
                  onCreated={async (account) => {
                    // Append, don't merge-filter: chartAccounts holds every
                    // account type, and the expense-only merge would drop the
                    // revenue ones the cash-in picker needs.
                    setChartAccounts((prev) =>
                      prev.some((a) => a.id === account.id)
                        ? prev
                        : [...prev, account],
                    );
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
              placeholder="e.g. 500,00"
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
