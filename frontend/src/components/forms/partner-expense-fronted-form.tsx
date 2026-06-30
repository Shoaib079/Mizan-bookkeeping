"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  filterExpenseAccounts,
  formatExpenseAccountLabel,
  findExpenseAccountByCode,
  type ChartAccount,
} from "@/lib/expense-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

export function PartnerExpenseFrontedForm({
  open,
  onClose,
  partnerId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Partner expense fronted");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadChart = useCallback(async () => {
    if (!entityId) return;
    const chart = await apiFetch<{ items: ChartAccount[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const expenses = filterExpenseAccounts(chart.items);
    setExpenseAccounts(expenses);
    const general = findExpenseAccountByCode(chart.items, "5200");
    if (general) setExpenseAccountId(general.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadChart().catch(() => undefined);
    }
  }, [open, loadChart]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const expenseDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!expenseDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/partners/${partnerId}/expenses-fronted`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expense_date: expenseDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            expense_account_id: expenseAccountId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Expense recorded");
      onClose();
      setAmountText("");
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
      title="Expense fronted by partner"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="pf-date">Expense date (DD.MM.YYYY)</Label>
          <DateInput
            id="pf-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pf-amount">Amount (TRY)</Label>
          <MoneyInput
            id="pf-amount"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pf-desc">Description</Label>
          <Input
            id="pf-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pf-account">Expense account</Label>
          <Combobox
            id="pf-account"
            value={expenseAccountId}
            onValueChange={setExpenseAccountId}
            options={expenseAccounts.map((a) => ({
              value: a.id,
              label: formatExpenseAccountLabel(a),
            }))}
            placeholder="Expense account…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record expense fronted"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
