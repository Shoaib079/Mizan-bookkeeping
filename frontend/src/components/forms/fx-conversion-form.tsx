"use client";

/** FX conversion to TRY — Phase 9 Slice 4. */

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
  embedded?: boolean;
  onSaved?: () => void;
};

export function FxConversionForm({
  open,
  onClose,
  fxAccountId,
  currency,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [tryAccounts, setTryAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [tryAccountId, setTryAccountId] = useState("");
  const [nativeText, setNativeText] = useState("");
  const [tryReceivedText, setTryReceivedText] = useState("");
  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState(`Convert ${currency} to TRY`);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const [bankRes, cashRes] = await Promise.all([
      apiFetch<{ items: MoneyAccountLeaf[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
      ),
      apiFetch<{ items: MoneyAccountLeaf[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
    ]);
    const merged = [...bankRes.items, ...cashRes.items].filter(
      (a) => a.is_active,
    );
    setTryAccounts(merged);
    if (merged[0]) setTryAccountId(merged[0].id);
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
    const tryReceivedKurus = parseTryToKurus(tryReceivedText);
    const conversionDate = parseTrDate(dateText);
    if (nativeQuantity === null || nativeQuantity <= 0) {
      setError(`Enter a valid ${currency} amount.`);
      return;
    }
    if (tryReceivedKurus === null || tryReceivedKurus <= 0) {
      setError("Enter valid TRY received.");
      return;
    }
    if (!conversionDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/fx/conversions`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fx_money_account_id: fxAccountId,
          try_money_account_id: tryAccountId,
          native_quantity: nativeQuantity,
          try_received_kurus: tryReceivedKurus,
          conversion_date: conversionDate,
          description,
          actor_id: actorId,
        }),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("FX conversion recorded");
      onClose();
      setNativeText("");
      setTryReceivedText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={`Convert ${currency} to TRY`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="fx-conv-native">{currency} spent</Label>
          <Input
            id="fx-conv-native"
            placeholder="50,00"
            value={nativeText}
            onChange={(e) => setNativeText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-conv-try">TRY received</Label>
          <MoneyInput
            id="fx-conv-try"
            placeholder="1.750,00"
            value={tryReceivedText}
            onChange={setTryReceivedText}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-conv-to">Deposit to (TRY)</Label>
          <Combobox
            id="fx-conv-to"
            value={tryAccountId}
            onValueChange={setTryAccountId}
            options={tryAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="TRY account…"
          />
        </div>
        <div>
          <Label htmlFor="fx-conv-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="fx-conv-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-conv-desc">Description</Label>
          <Input
            id="fx-conv-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Converting…" : "Record conversion"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
