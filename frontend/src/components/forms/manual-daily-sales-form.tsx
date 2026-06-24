"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

type MoneyAccount = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ManualDailySalesForm({ open, onClose }: Props) {
  const { entityId, actorId } = useEntity();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccount[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [cashText, setCashText] = useState("");
  const [cardText, setCardText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccount[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    setCashAccounts(res.items);
    if (res.items[0]) setMoneyAccountId(res.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) void loadOptions().catch(() => undefined);
  }, [open, loadOptions]);

  const cashKurus = parseTryToKurus(cashText) ?? 0;
  const cardKurus = parseTryToKurus(cardText) ?? 0;
  const totalKurus = cashKurus + cardKurus;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Set an entity ID in the sidebar first.");
      return;
    }
    const salesDate = parseTrDate(dateText);
    if (!salesDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (totalKurus <= 0) {
      setError("Enter cash and/or card sales.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/pos/manual-daily-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_date: salesDate,
          cash_kurus: cashKurus,
          card_kurus: cardKurus,
          money_account_id: moneyAccountId,
          actor_id: actorId,
        }),
      });
      onClose();
      setCashText("");
      setCardText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Daily sales (manual)" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="sales-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="sales-date"
            placeholder="23.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="sales-cash">Cash sales</Label>
          <Input
            id="sales-cash"
            placeholder="0,00"
            value={cashText}
            onChange={(e) => setCashText(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="sales-card">Card sales</Label>
          <Input
            id="sales-card"
            placeholder="0,00"
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
          />
        </div>
        {totalKurus > 0 && (
          <p className="text-xs text-muted-foreground">
            Total: {formatTry(totalKurus)} (cash + card must match)
          </p>
        )}
        <div>
          <Label htmlFor="sales-drawer">Cash drawer</Label>
          <Select
            id="sales-drawer"
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
          {submitting ? "Posting…" : "Post daily sales"}
        </Button>
      </form>
    </Dialog>
  );
}
