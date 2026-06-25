"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function CardSalesForm({ open, onClose, onSaved }: Props) {
  const { entityId, actorId } = useEntity();
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Card sales batch");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDateText(todayTrDate());
    setError(null);
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const salesDate = parseTrDate(dateText);
    const grossKurus = parseTryToKurus(amountText);
    if (!salesDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (grossKurus === null || grossKurus <= 0) {
      setError("Enter a valid gross card sales amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/pos/card-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_date: salesDate,
          gross_amount_kurus: grossKurus,
          description: description.trim() || "Card sales batch",
          actor_id: actorId,
        }),
      });
      onSaved?.();
      onClose();
      setDateText(todayTrDate());
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Card sales batch" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="card-date">Sales date (DD.MM.YYYY)</Label>
          <DateInput
            id="card-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="card-gross">Gross card sales</Label>
          <Input
            id="card-gross"
            placeholder="0,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="card-desc">Description</Label>
          <Input
            id="card-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Posting…" : "Post card sales to clearing"}
        </Button>
      </form>
    </Dialog>
  );
}
