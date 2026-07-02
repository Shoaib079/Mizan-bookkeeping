"use client";

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
import { useEntity } from "@/lib/entity-context";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import type { DeliveryPlatform, MoneyAccountOption } from "@/lib/pos-delivery-types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  defaultPlatformId?: string;
};

export function DeliverySettlementForm({
  open,
  onClose,
  onSaved,
  defaultPlatformId,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([]);
  const [bankAccounts, setBankAccounts] = useState<MoneyAccountOption[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Delivery settlement");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!entityId) return;
    const [platRes, bankRes] = await Promise.all([
      apiFetch<{ items: DeliveryPlatform[] }>(
        `/entities/${entityId}/delivery/platforms?limit=50`,
      ),
      apiFetch<{ items: MoneyAccountOption[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
      ),
    ]);
    const active = platRes.items.filter((p) => p.is_active);
    setPlatforms(active);
    setBankAccounts(bankRes.items);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setPlatformId(defaultPlatformId ?? "");
      setMoneyAccountId("");
      setDateText(todayTrDate());
      setAmountText("");
      setDescription("Delivery settlement");
      setError(null);
      void loadOptions().catch(() => undefined);
    }
  }, [open, loadOptions, defaultPlatformId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    if (!platformId) {
      setError("Choose a delivery platform.");
      return;
    }
    if (!moneyAccountId) {
      setError("Choose a bank account.");
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
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/delivery/settlements`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_platform_id: platformId,
          money_account_id: moneyAccountId,
          settlement_date: settlementDate,
          amount_kurus: amountKurus,
          description: description.trim() || "Delivery settlement",
          actor_id: actorId,
        }),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Settlement recorded");
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
    <Dialog open={open} title="Delivery settlement" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="ds-platform">Platform</Label>
          <Combobox
            id="ds-platform"
            value={platformId}
            onValueChange={setPlatformId}
            options={platforms.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            placeholder="Choose platform…"
            required
          />
        </div>
        <div>
          <Label htmlFor="ds-bank">Bank account</Label>
          <Combobox
            id="ds-bank"
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            options={bankAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Choose bank account…"
            required
          />
        </div>
        <div>
          <Label htmlFor="ds-date">Settlement date (DD.MM.YYYY)</Label>
          <DateInput
            id="ds-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="ds-amount">Net payout amount</Label>
          <MoneyInput
            id="ds-amount"
            placeholder="0,00"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="ds-desc">Description</Label>
          <Input
            id="ds-desc"
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
