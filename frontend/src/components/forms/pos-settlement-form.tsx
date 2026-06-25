"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import type { MoneyAccountOption } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function PosSettlementForm({ open, onClose, onSaved }: Props) {
  const { entityId, actorId } = useEntity();
  const [bankAccounts, setBankAccounts] = useState<MoneyAccountOption[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [commissionText, setCommissionText] = useState("");
  const [description, setDescription] = useState("POS settlement");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccountOption[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
    );
    setBankAccounts(res.items);
    if (res.items[0]) setMoneyAccountId(res.items[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadOptions().catch(() => undefined);
    }
  }, [open, loadOptions]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const settlementDate = parseTrDate(dateText);
    const amountKurus = parseTryToKurus(amountText);
    if (!settlementDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid settlement amount.");
      return;
    }
    const commissionKurus = parseTryToKurus(commissionText);
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        money_account_id: moneyAccountId,
        settlement_date: settlementDate,
        amount_kurus: amountKurus,
        description: description.trim() || "POS settlement",
        actor_id: actorId,
      };
      if (commissionKurus !== null && commissionKurus >= 0) {
        body.commission_kurus = commissionKurus;
      }
      await apiFetch(`/entities/${entityId}/pos/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved?.();
      onClose();
      setDateText(todayTrDate());
      setAmountText("");
      setCommissionText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="POS card settlement" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="pos-settle-date">Settlement date (DD.MM.YYYY)</Label>
          <DateInput
            id="pos-settle-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pos-settle-bank">Bank account</Label>
          <Select
            id="pos-settle-bank"
            value={moneyAccountId}
            onChange={(e) => setMoneyAccountId(e.target.value)}
          >
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="pos-settle-amount">Net settlement amount</Label>
          <Input
            id="pos-settle-amount"
            placeholder="0,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pos-settle-commission">Commission (optional)</Label>
          <Input
            id="pos-settle-commission"
            placeholder="0,00"
            value={commissionText}
            onChange={(e) => setCommissionText(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="pos-settle-desc">Description</Label>
          <Input
            id="pos-settle-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Posting…" : "Record settlement"}
        </Button>
      </form>
    </Dialog>
  );
}
