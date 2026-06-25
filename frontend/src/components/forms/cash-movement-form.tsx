"use client";

/** Cash drawer movement — Phase 9 Slice 4. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type ChartAccount = { id: string; code: string; name_en: string };

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
    setOffsetAccounts(chartRes.items.filter((a) => a.code.startsWith("5")));
    if (defaultCashAccountId) setMoneyAccountId(defaultCashAccountId);
    else if (cashRes.items[0]) setMoneyAccountId(cashRes.items[0].id);
    if (chartRes.items[0]) setOffsetAccountId(chartRes.items[0].id);
  }, [entityId, defaultCashAccountId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadData().catch(() => undefined);
    }
  }, [open, loadData]);

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
      await apiFetch(`/entities/${entityId}/cash/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          money_account_id: moneyAccountId,
          movement_date: movementDate,
          direction,
          amount_kurus: amountKurus,
          offset_account_id: offsetAccountId,
          description,
          actor_id: actorId,
        }),
      });
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
    <Dialog open={open} title="Cash drawer movement" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Opens today&apos;s drawer session automatically on first movement.
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
          <Label htmlFor="cash-offset">Offset account (expense)</Label>
          <Combobox
            id="cash-offset"
            value={offsetAccountId}
            onValueChange={setOffsetAccountId}
            options={offsetAccounts.map((a) => ({
              value: a.id,
              label: `${a.code} — ${a.name_en}`,
            }))}
            placeholder="Expense account…"
          />
        </div>
        <div>
          <Label htmlFor="cash-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="cash-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="cash-amount">Amount (TRY)</Label>
          <Input
            id="cash-amount"
            placeholder="500,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record movement"}
        </Button>
      </form>
    </Dialog>
  );
}
