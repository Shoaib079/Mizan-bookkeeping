"use client";

/** Cash drawer EOD close by date — optional session reconcile (Phase 11.13). */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCashAccountId?: string;
  defaultSessionDate?: string;
  onClosed?: () => void;
};

export function CashDrawerCloseDayForm({
  open,
  onClose,
  defaultCashAccountId,
  defaultSessionDate,
  onClosed,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [countedText, setCountedText] = useState("");
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const cashRes = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    setCashAccounts(cashRes.items.filter((a) => a.is_active));
    if (defaultCashAccountId) setMoneyAccountId(defaultCashAccountId);
    else if (cashRes.items[0]) setMoneyAccountId(cashRes.items[0].id);
  }, [entityId, defaultCashAccountId]);

  useEffect(() => {
    if (open) {
      setDateText(defaultSessionDate ?? todayTrDate());
      void loadAccounts().catch(() => undefined);
    }
  }, [open, defaultSessionDate, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const countedKurus = parseTryToKurus(countedText);
    const sessionDate = parseTrDate(dateText);
    if (countedKurus === null || countedKurus < 0) {
      setError("Enter a valid counted balance.");
      return;
    }
    if (!sessionDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/cash/drawer-sessions/close-day`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          money_account_id: moneyAccountId,
          session_date: sessionDate,
          counted_balance_kurus: countedKurus,
          actor_id: actorId,
          description,
        }),
      });
      submitIdempotency.completeSubmit();
      onClosed?.();
      toast("Drawer day closed");
      onClose();
      setCountedText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Close drawer day" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="close-day-date">Session date (DD.MM.YYYY)</Label>
          <DateInput
            id="close-day-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Count the drawer for a day, compare to the ledger balance, and post
          over/short to 5400. Links any movements recorded that day.
        </p>
        <div>
          <Label htmlFor="close-day-acct">Cash account</Label>
          <Combobox
            id="close-day-acct"
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
          <Label htmlFor="close-day-counted">Counted balance (TRY)</Label>
          <MoneyInput
            id="close-day-counted"
            placeholder="2.350,00"
            value={countedText}
            onChange={setCountedText}
            required
          />
        </div>
        <div>
          <Label htmlFor="close-day-desc">Description</Label>
          <Input
            id="close-day-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Closing…" : "Close drawer day"}
        </Button>
      </form>
    </Dialog>
  );
}
