"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  kind: "advance" | "payment";
  payCurrency: string;
  onSaved?: () => void;
};

export function StaffCashMovementForm({
  open,
  onClose,
  employeeId,
  kind,
  payCurrency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState(
    kind === "advance" ? "Salary advance" : "Salary payment",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadBankAndCashAccounts(entityId);
    setAccounts(merged);
    const cash = merged.find((a) => a.account_kind === "cash");
    setPaymentAccountId(cash?.id ?? merged[0]?.id ?? "");
  }, [entityId]);

  useEffect(() => {
    if (open) void loadAccounts().catch(() => undefined);
  }, [open, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountMinor = parseTryToKurus(amountText);
    const paymentDate = parseTrDate(dateText);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!paymentAccountId) {
      setError("Choose a cash or bank account.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const path =
        kind === "advance"
          ? `/entities/${entityId}/staff/employees/${employeeId}/advances`
          : `/entities/${entityId}/staff/employees/${employeeId}/payments`;
      await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_date: paymentDate,
          amount_minor: amountMinor,
          description,
          actor_id: actorId,
          payment_account_id: paymentAccountId,
        }),
      });
      onSaved?.();
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title = kind === "advance" ? "Record advance" : "Record salary payment";

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pays from cash or bank ({payCurrency}).
        </p>
        <div>
          <Label htmlFor="staff-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="staff-date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="staff-amount">Amount ({payCurrency})</Label>
          <Input
            id="staff-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="staff-desc">Description</Label>
          <Input
            id="staff-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="staff-account">Pay from</Label>
          <Select
            id="staff-account"
            value={paymentAccountId}
            onChange={(e) => setPaymentAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.account_kind})
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : title}
        </Button>
      </form>
    </Dialog>
  );
}
