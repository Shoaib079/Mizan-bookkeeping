"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";

type Account = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  onSaved?: () => void;
};

export function PartnerExpenseFrontedForm({
  open,
  onClose,
  partnerId,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Partner expense fronted");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadChart = useCallback(async () => {
    if (!entityId) return;
    const chart = await apiFetch<{ items: Account[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const expenses = chart.items.filter((a) => a.code.startsWith("5"));
    setExpenseAccounts(expenses);
    const general = expenses.find((a) => a.code === "5200");
    if (general) setExpenseAccountId(general.id);
    else if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) void loadChart().catch(() => undefined);
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
      await apiFetch(
        `/entities/${entityId}/partners/${partnerId}/expenses-fronted`,
        {
          method: "POST",
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
      onSaved?.();
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Expense fronted by partner" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="pf-date">Expense date (DD.MM.YYYY)</Label>
          <Input
            id="pf-date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pf-amount">Amount (TRY)</Label>
          <Input
            id="pf-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
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
          <Select
            id="pf-account"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record expense fronted"}
        </Button>
      </form>
    </Dialog>
  );
}
