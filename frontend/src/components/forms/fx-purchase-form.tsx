"use client";

/** FX purchase — Phase 9 Slice 4. */

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
import { parseFxNative } from "@/lib/fx-money";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  fxAccountId: string;
  currency: string;
  onSaved?: () => void;
};

export function FxPurchaseForm({
  open,
  onClose,
  fxAccountId,
  currency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [tryCashAccounts, setTryCashAccounts] = useState<MoneyAccountLeaf[]>(
    [],
  );
  const [tryCashId, setTryCashId] = useState("");
  const [nativeText, setNativeText] = useState("");
  const [tryCostText, setTryCostText] = useState("");
  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState(`Buy ${currency}`);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const cashRes = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    const accounts = cashRes.items.filter((a) => a.is_active);
    setTryCashAccounts(accounts);
    if (accounts[0]) setTryCashId(accounts[0].id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const nativeQuantity = parseFxNative(nativeText);
    const tryCostKurus = parseTryToKurus(tryCostText);
    const purchaseDate = parseTrDate(dateText);
    if (nativeQuantity === null || nativeQuantity <= 0) {
      setError(`Enter a valid ${currency} amount.`);
      return;
    }
    if (tryCostKurus === null || tryCostKurus <= 0) {
      setError("Enter a valid TRY cost.");
      return;
    }
    if (!purchaseDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/fx/purchases`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fx_money_account_id: fxAccountId,
          try_cash_money_account_id: tryCashId,
          native_quantity: nativeQuantity,
          try_cost_kurus: tryCostKurus,
          purchase_date: purchaseDate,
          description,
          actor_id: actorId,
        }),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("FX purchase recorded");
      onClose();
      setNativeText("");
      setTryCostText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title={`Buy ${currency}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="fx-buy-native">{currency} amount</Label>
          <Input
            id="fx-buy-native"
            placeholder="100,00"
            value={nativeText}
            onChange={(e) => setNativeText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-buy-try">TRY paid</Label>
          <MoneyInput
            id="fx-buy-try"
            placeholder="3.450,00"
            value={tryCostText}
            onChange={setTryCostText}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-buy-from">Pay from cash drawer</Label>
          <Combobox
            id="fx-buy-from"
            value={tryCashId}
            onValueChange={setTryCashId}
            options={tryCashAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Cash drawer…"
          />
        </div>
        <div>
          <Label htmlFor="fx-buy-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="fx-buy-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-buy-desc">Description</Label>
          <Input
            id="fx-buy-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record purchase"}
        </Button>
      </form>
    </Dialog>
  );
}
