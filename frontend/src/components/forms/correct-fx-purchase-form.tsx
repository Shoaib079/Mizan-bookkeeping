"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative, formatFxNative } from "@/lib/fx-money";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableFxPurchaseRow = {
  journal_entry_id: string;
  movement_date: string;
  native_quantity: number;
  try_cost_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  fxAccountId: string;
  currency: string;
  purchase: CorrectableFxPurchaseRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectFxPurchaseForm({
  open,
  fxAccountId,
  currency,
  purchase,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [tryCashAccounts, setTryCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [tryCashId, setTryCashId] = useState("");
  const [nativeText, setNativeText] = useState("");
  const [tryCostText, setTryCostText] = useState("");
  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
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
    if (!open || !purchase) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(purchase.movement_date));
    setNativeText(formatFxNative(Math.abs(purchase.native_quantity), currency));
    setTryCostText(formatKurus(purchase.try_cost_kurus));
    setDescription(purchase.description);
    setReason("");
    setError(null);
  }, [open, purchase, loadAccounts, currency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !purchase) {
      setError("Select a restaurant and purchase first.");
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
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/fx/purchases/${purchase.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  fx_money_account_id: fxAccountId,
                  try_cash_money_account_id: tryCashId,
                  native_quantity: nativeQuantity,
                  try_cost_kurus: tryCostKurus,
                  purchase_date: purchaseDate,
                  description: description.trim() || `Buy ${currency}`,
                  actor_id: actorId,
                  reason: reason.trim() || null,
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("FX purchase corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title={`Edit ${currency} purchase`} onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cfp-date">Date (DD.MM.YYYY)</Label>
            <DateInput
              id="cfp-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="cfp-native">{currency} amount</Label>
            <Input
              id="cfp-native"
              value={nativeText}
              onChange={(e) => setNativeText(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cfp-try">TRY paid</Label>
            <MoneyInput
              id="cfp-try"
              value={tryCostText}
              onChange={setTryCostText}
              required
            />
          </div>
          <div>
            <Label htmlFor="cfp-from">Pay from cash drawer</Label>
            <Combobox
              id="cfp-from"
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
            <Label htmlFor="cfp-desc">Description</Label>
            <Input
              id="cfp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="cfp-reason">Edit reason (optional)</Label>
            <Input
              id="cfp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || !purchase}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
