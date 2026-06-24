"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

type MoneyAccount = { id: string; name: string; account_kind: string };
type Account = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ManualExpenseForm({ open, onClose }: Props) {
  const { entityId, actorId } = useEntity();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [itemName, setItemName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [accountsRes, chartRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
      apiFetch<{ items: Account[] }>(
        `/entities/${entityId}/chart-of-accounts?limit=200`,
      ),
    ]);
    setCashAccounts(accountsRes.items);
    const general = chartRes.items.find((a) => a.code === "5200");
    if (general) setExpenseAccountId(general.id);
    if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

  useEffect(() => {
    const kurus = parseTryToKurus(amountText);
    setParsedPreview(kurus !== null ? formatTry(kurus) : null);
  }, [amountText]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Set an entity ID in the sidebar first.");
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
      await apiFetch(`/entities/${entityId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate,
          amount_kurus: amountKurus,
          expense_account_id: expenseAccountId,
          money_account_id: moneyAccountId,
          written_item_description: itemName || null,
          has_source_document: false,
          description: itemName || "Manual expense",
          actor_id: actorId,
        }),
      });
      onClose();
      setItemName("");
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Manual expense" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="exp-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="exp-date"
            placeholder="23.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="exp-item">Item name</Label>
          <Input
            id="exp-item"
            placeholder="peynir"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="exp-amount">Amount (TRY)</Label>
          <Input
            id="exp-amount"
            placeholder="150,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
          {parsedPreview && (
            <p className="mt-1 text-xs text-muted-foreground">
              Parsed: {parsedPreview}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="exp-cash">Cash drawer</Label>
          <Select
            id="exp-cash"
            value={moneyAccountId}
            onChange={(e) => setMoneyAccountId(e.target.value)}
          >
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </Dialog>
  );
}
