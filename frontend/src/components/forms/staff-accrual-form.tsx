"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  payCurrency: string;
  onSaved?: () => void;
};

export function StaffAccrualForm({
  open,
  onClose,
  employeeId,
  payCurrency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Salary accrual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountMinor = parseTryToKurus(amountText);
    const accrualDate = parseTrDate(dateText);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!accrualDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/accruals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accrual_date: accrualDate,
            amount_minor: amountMinor,
            description,
            actor_id: actorId,
          }),
        },
      );
      onSaved?.();
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accrual failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Salary accrual" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Accrues salary payable ({payCurrency}). No cash movement.
        </p>
        <div>
          <Label htmlFor="acc-date">Accrual date (DD.MM.YYYY)</Label>
          <Input
            id="acc-date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="acc-amount">Amount ({payCurrency})</Label>
          <Input
            id="acc-amount"
            placeholder="15.000,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="acc-desc">Description</Label>
          <Input
            id="acc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record accrual"}
        </Button>
      </form>
    </Dialog>
  );
}
