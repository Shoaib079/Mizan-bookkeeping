"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { useToast } from "@/lib/toast";

type MoneyAccount = { id: string; name: string; account_kind: string };
type Account = { id: string; code: string; name: string };

const MANUAL_EXPENSE_ACCOUNT_CODES = ["5200", "5700"];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-select expense account by chart code (e.g. `5700` for cash tips). */
  defaultExpenseAccountCode?: string;
};

export function ManualExpenseForm({
  open,
  onClose,
  defaultExpenseAccountCode,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
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
    const pickable = chartRes.items.filter((a) =>
      MANUAL_EXPENSE_ACCOUNT_CODES.includes(a.code),
    );
    setExpenseAccounts(pickable);
    const preferred = defaultExpenseAccountCode
      ? pickable.find((a) => a.code === defaultExpenseAccountCode)
      : pickable.find((a) => a.code === "5200");
    if (preferred) setExpenseAccountId(preferred.id);
    else if (pickable[0]) setExpenseAccountId(pickable[0].id);
    if (accountsRes.items[0]) setMoneyAccountId(accountsRes.items[0].id);
  }, [entityId, defaultExpenseAccountCode]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadOptions().catch(() => undefined);
    }
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
    if (!expenseAccountId) {
      setError("Choose an expense account.");
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
      toast(
        defaultExpenseAccountCode === "5700"
          ? "Cash tip expense saved"
          : "Expense saved",
      );
      setItemName("");
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={
        defaultExpenseAccountCode === "5700"
          ? "Cash tip expense"
          : "Manual expense"
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="exp-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="exp-date"
            value={dateText}
            onChange={setDateText}
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
          <Label htmlFor="exp-account">Expense account</Label>
          <Select
            id="exp-account"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Use 5700 Tips Expense for cash tips paid from the drawer.
          </p>
        </div>
        <div>
          <Label htmlFor="exp-cash">Cash drawer</Label>
          <Combobox
            id="exp-cash"
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            options={cashAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Cash drawer…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </Dialog>
  );
}
