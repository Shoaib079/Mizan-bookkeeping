"use client";

/** FX expense spend — Phase 9 Slice 4. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import { parseTrDate } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type ChartAccount = { id: string; code: string; name_en: string };

type Props = {
  open: boolean;
  onClose: () => void;
  fxAccountId: string;
  currency: string;
  onSaved?: () => void;
};

export function FxExpenseSpendForm({
  open,
  onClose,
  fxAccountId,
  currency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [expenseAccounts, setExpenseAccounts] = useState<ChartAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [nativeText, setNativeText] = useState("");
  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState(`FX expense (${currency})`);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: ChartAccount[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const expenses = res.items.filter((a) => a.code.startsWith("5"));
    setExpenseAccounts(expenses);
    if (expenses[0]) setExpenseAccountId(expenses[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const nativeQuantity = parseFxNative(nativeText);
    const spendDate = parseTrDate(dateText);
    if (nativeQuantity === null || nativeQuantity <= 0) {
      setError(`Enter a valid ${currency} amount.`);
      return;
    }
    if (!spendDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/fx/expense-spends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fx_money_account_id: fxAccountId,
          expense_account_id: expenseAccountId,
          native_quantity: nativeQuantity,
          spend_date: spendDate,
          description,
          actor_id: actorId,
        }),
      });
      onSaved?.();
      toast("FX spend recorded");
      onClose();
      setNativeText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spend failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title={`Spend ${currency} on expense`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="fx-spend-native">{currency} amount</Label>
          <Input
            id="fx-spend-native"
            placeholder="25,00"
            value={nativeText}
            onChange={(e) => setNativeText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-spend-exp">Expense account</Label>
          <Select
            id="fx-spend-exp"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name_en}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fx-spend-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="fx-spend-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-spend-desc">Description</Label>
          <Input
            id="fx-spend-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record spend"}
        </Button>
      </form>
    </Dialog>
  );
}
