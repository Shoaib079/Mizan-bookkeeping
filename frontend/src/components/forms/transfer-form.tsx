"use client";

/** Account transfer — Phase 9 Slice 4. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultFromId?: string;
  defaultToId?: string;
  onTransferred?: () => void;
};

export function TransferForm({
  open,
  onClose,
  defaultFromId,
  defaultToId,
  onTransferred,
}: Props) {
  const { entityId, actorId } = useEntity();
  const [accounts, setAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Account transfer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?limit=100`,
    );
    setAccounts(res.items.filter((a) => a.is_active));
    if (defaultFromId) setFromId(defaultFromId);
    else if (res.items[0]) setFromId(res.items[0].id);
    if (defaultToId) setToId(defaultToId);
    else if (res.items[1]) setToId(res.items[1].id);
  }, [entityId, defaultFromId, defaultToId]);

  useEffect(() => {
    if (open) void loadAccounts().catch(() => undefined);
  }, [open, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (fromId === toId) {
      setError("From and to accounts must differ.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const transferDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!transferDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/banking/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_money_account_id: fromId,
          to_money_account_id: toId,
          transfer_date: transferDate,
          amount_kurus: amountKurus,
          description,
          actor_id: actorId,
        }),
      });
      onTransferred?.();
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Transfer between accounts" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="xfer-from">From</Label>
          <Select
            id="xfer-from"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.account_kind})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="xfer-to">To</Label>
          <Select
            id="xfer-to"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.account_kind})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="xfer-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="xfer-date"
            placeholder="24.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="xfer-amount">Amount (TRY)</Label>
          <Input
            id="xfer-amount"
            placeholder="1.500,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="xfer-desc">Description</Label>
          <Input
            id="xfer-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Transferring…" : "Record transfer"}
        </Button>
      </form>
    </Dialog>
  );
}
