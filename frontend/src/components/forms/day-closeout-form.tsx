"use client";

/** Day close-out — sales + N expense rows in one atomic post (Slice 11.15). */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { defaultMainDrawerId } from "@/lib/load-money-accounts";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useToast } from "@/lib/toast";

type MoneyAccount = { id: string; name: string; account_kind?: string };
type Account = { id: string; code: string; name: string };

const EXPENSE_ACCOUNT_CODES = ["5200", "5700"];

type ExpenseRow = {
  key: string;
  itemDescription: string;
  amountText: string;
  expenseAccountId: string;
};

type DayCloseoutResponse = {
  pos_daily_summary_id: string;
  pos_daily_summary_status: string;
  expenses: { expense_id: string; journal_entry_id: string }[];
};

function newExpenseRow(defaultAccountId: string): ExpenseRow {
  return {
    key: crypto.randomUUID(),
    itemDescription: "",
    amountText: "",
    expenseAccountId: defaultAccountId,
  };
}

export function DayCloseoutForm() {
  const router = useRouter();
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [zReportEnabled, setZReportEnabled] = useState(false);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [cashText, setCashText] = useState("");
  const [cardText, setCardText] = useState("");
  const [zReportText, setZReportText] = useState("");
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes, zEnabled] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
      isEntitySettingEnabled(entityId, "card_tips_z_report_enabled"),
    ]);
    setCashAccounts(accountsRes.items);
    setZReportEnabled(zEnabled);
    const pickable = chartRes.items.filter((a) =>
      EXPENSE_ACCOUNT_CODES.includes(a.code),
    );
    setExpenseAccounts(pickable);
    const defaultAccount =
      pickable.find((a) => a.code === "5200") ?? pickable[0];
    const drawerId = defaultMainDrawerId(
      accountsRes.items.map((a) => ({
        id: a.id,
        gl_account_id: "",
        name: a.name,
        account_kind: a.account_kind ?? "cash",
      })),
    );
    if (drawerId) setMoneyAccountId(drawerId);
    else if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
    setExpenseRows([
      newExpenseRow(defaultAccount?.id ?? ""),
    ]);
    setOptionsLoaded(true);
  }, [entityId]);

  useEffect(() => {
    if (!entityId) {
      setOptionsLoaded(false);
      return;
    }
    setDateText(todayTrDate());
    setCashText("");
    setCardText("");
    setZReportText("");
    setError(null);
    submitIdempotency.resetSubmit();
    void loadOptions().catch(() => undefined);
  }, [entityId, loadOptions, submitIdempotency]);

  const cashKurus = parseTryToKurus(cashText) ?? 0;
  const cardKurus = parseTryToKurus(cardText) ?? 0;
  const totalSalesKurus = cashKurus + cardKurus;
  const zReportKurus = zReportEnabled ? parseTryToKurus(zReportText) : null;
  const hasSalesInput = cashText.trim() !== "" || cardText.trim() !== "";
  const salesTotalInvalid = hasSalesInput && totalSalesKurus <= 0;
  const zMismatch =
    zReportEnabled &&
    zReportKurus !== null &&
    zReportKurus > 0 &&
    cardKurus !== zReportKurus;

  const expenseTotalKurus = expenseRows.reduce((sum, row) => {
    const amount = parseTryToKurus(row.amountText);
    return sum + (amount ?? 0);
  }, 0);

  const submitBlocked = totalSalesKurus <= 0 || !moneyAccountId;

  function updateExpenseRow(key: string, patch: Partial<ExpenseRow>) {
    setExpenseRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addExpenseRow() {
    const defaultAccount =
      expenseAccounts.find((a) => a.code === "5200") ?? expenseAccounts[0];
    setExpenseRows((rows) => [
      ...rows,
      newExpenseRow(defaultAccount?.id ?? ""),
    ]);
  }

  function removeExpenseRow(key: string) {
    setExpenseRows((rows) =>
      rows.length <= 1 ? rows : rows.filter((row) => row.key !== key),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const salesDate = parseTrDate(dateText);
    if (!salesDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (totalSalesKurus <= 0) {
      setError("Enter cash and/or card sales.");
      return;
    }

    const expenseLines: {
      amount_kurus: number;
      expense_account_id: string;
      item_description: string | null;
    }[] = [];
    for (const row of expenseRows) {
      const amount = parseTryToKurus(row.amountText);
      if (amount === null || amount <= 0) continue;
      if (!row.expenseAccountId) {
        setError("Choose an expense account for each row with an amount.");
        return;
      }
      expenseLines.push({
        amount_kurus: amount,
        expense_account_id: row.expenseAccountId,
        item_description: row.itemDescription.trim() || null,
      });
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const body: Record<string, unknown> = {
        sales_date: salesDate,
        cash_kurus: cashKurus,
        card_kurus: cardKurus,
        money_account_id: moneyAccountId,
        actor_id: actorId,
        expense_lines: expenseLines,
      };
      if (zReportEnabled && zReportKurus !== null && zReportKurus > 0) {
        body.z_report_kurus = zReportKurus;
      }

      const result = await submitWithPeriodUnlock(async (periodUnlockReason) => {
        return apiFetch<DayCloseoutResponse>(
          `/entities/${entityId}/operations/day-closeout`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(body, periodUnlockReason),
            ),
          },
        );
      });

      if (result.pos_daily_summary_status !== "posted") {
        setError(
          `Sales status "${result.pos_daily_summary_status}" — check Sales before posting again.`,
        );
        return;
      }

      submitIdempotency.completeSubmit();
      toast(
        `Day posted — ${result.expenses.length} expense${result.expenses.length === 1 ? "" : "s"}`,
      );
      router.push("/sales");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (!optionsLoaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-6">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Date</h2>
          <div>
            <Label htmlFor="closeout-date">Business date (DD.MM.YYYY)</Label>
            <DateInput
              id="closeout-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Daily sales</h2>
          <div>
            <Label htmlFor="closeout-cash">Cash sales</Label>
            <MoneyInput
              id="closeout-cash"
              placeholder="0,00"
              value={cashText}
              onChange={setCashText}
              showPreview={false}
              showInvalidHint={false}
            />
          </div>
          <div>
            <Label htmlFor="closeout-card">Card sales</Label>
            <MoneyInput
              id="closeout-card"
              placeholder="0,00"
              value={cardText}
              onChange={setCardText}
              showPreview={false}
              showInvalidHint={false}
            />
          </div>
          {zReportEnabled && (
            <div>
              <Label htmlFor="closeout-z">
                Card-terminal Z report total (optional)
              </Label>
              <MoneyInput
                id="closeout-z"
                placeholder="0,00"
                value={zReportText}
                onChange={setZReportText}
                showPreview={false}
                showInvalidHint={false}
              />
            </div>
          )}
          {hasSalesInput && (
            <ValidationHint variant={salesTotalInvalid ? "error" : "hint"}>
              {salesTotalInvalid
                ? "Enter cash and/or card sales — total cannot be zero."
                : `Sales total: ${formatTry(totalSalesKurus)}`}
            </ValidationHint>
          )}
          {zMismatch && (
            <ValidationHint variant="warning">
              Z report ({formatTry(zReportKurus!)}) does not match card sales (
              {formatTry(cardKurus)}). Close-out will be rejected — fix figures
              first.
            </ValidationHint>
          )}
          <div>
            <Label htmlFor="closeout-drawer">Cash drawer</Label>
            <Combobox
              id="closeout-drawer"
              value={moneyAccountId}
              onValueChange={setMoneyAccountId}
              options={cashAccounts.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              placeholder="Cash drawer…"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Cash expenses</h2>
            <Button type="button" variant="secondary" onClick={addExpenseRow}>
              Add row
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Quick drawer expenses for the same day — posted together with sales.
            Leave amount blank to skip a row.
          </p>
          {expenseRows.map((row, index) => (
            <div
              key={row.key}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Expense {index + 1}
              </p>
              <div>
                <Label htmlFor={`closeout-item-${row.key}`}>Item</Label>
                <Input
                  id={`closeout-item-${row.key}`}
                  placeholder="peynir"
                  value={row.itemDescription}
                  onChange={(e) =>
                    updateExpenseRow(row.key, {
                      itemDescription: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`closeout-amt-${row.key}`}>Amount (TRY)</Label>
                <MoneyInput
                  id={`closeout-amt-${row.key}`}
                  placeholder="150,00"
                  value={row.amountText}
                  onChange={(text) =>
                    updateExpenseRow(row.key, { amountText: text })
                  }
                  showPreview={false}
                />
              </div>
              <div>
                <Label htmlFor={`closeout-acct-${row.key}`}>
                  Expense account
                </Label>
                <Select
                  id={`closeout-acct-${row.key}`}
                  value={row.expenseAccountId}
                  onChange={(e) =>
                    updateExpenseRow(row.key, {
                      expenseAccountId: e.target.value,
                    })
                  }
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              {expenseRows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeExpenseRow(row.key)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {expenseTotalKurus > 0 && (
            <ValidationHint variant="hint">
              Expenses total: {formatTry(expenseTotalKurus)}
            </ValidationHint>
          )}
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Posting…" : "Post day"}
        </Button>
      </form>
      <PeriodUnlockDialog />
    </>
  );
}
