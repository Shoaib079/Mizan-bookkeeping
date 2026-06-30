"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Account = { id: string; code: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

export function CustomerCreditSaleForm({
  open,
  onClose,
  customerId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [revenueAccounts, setRevenueAccounts] = useState<Account[]>([]);
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Credit sale");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadChart = useCallback(async () => {
    if (!entityId) return;
    const chart = await apiFetch<{ items: Account[] }>(
      `/entities/${entityId}/chart-of-accounts?limit=200`,
    );
    const revenue = chart.items.filter((a) => a.code.startsWith("4"));
    setRevenueAccounts(revenue);
    const sales = revenue.find((a) => a.code === "4000");
    if (sales) setRevenueAccountId(sales.id);
    else if (revenue[0]) setRevenueAccountId(revenue[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadChart().catch(() => undefined);
    }
  }, [open, loadChart]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountKurus = parseTryToKurus(amountText);
    const saleDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!saleDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/customers/${customerId}/credit-sales`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sale_date: saleDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            revenue_account_id: revenueAccountId || null,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Credit sale recorded");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell embedded={embedded} open={open} title="Credit sale" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cs-date">Sale date (DD.MM.YYYY)</Label>
          <DateInput
            id="cs-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="cs-amount">Amount (TRY)</Label>
          <MoneyInput
            id="cs-amount"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="cs-desc">Description</Label>
          <Input
            id="cs-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cs-revenue">Revenue account</Label>
          <Combobox
            id="cs-revenue"
            value={revenueAccountId}
            onValueChange={setRevenueAccountId}
            options={revenueAccounts.map((a) => ({
              value: a.id,
              label: `${a.code} — ${a.name}`,
            }))}
            placeholder="Revenue account…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record credit sale"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
