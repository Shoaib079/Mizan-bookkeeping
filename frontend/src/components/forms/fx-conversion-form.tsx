"use client";

/** FX conversion to TRY — Phase 9 Slice 4. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import { parseTrDate, parseTryToKurus } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  fxAccountId: string;
  currency: string;
  onSaved?: () => void;
};

export function FxConversionForm({
  open,
  onClose,
  fxAccountId,
  currency,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
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
    if (open) void loadAccounts().catch(() => undefined);
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
      await apiFetch(`/entities/${entityId}/fx/conversions`, {
        method: "POST",
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
      onSaved?.();
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
    <Dialog open={open} title={`Convert ${currency} to TRY`} onClose={onClose}>
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
          <Input
            id="fx-conv-try"
            placeholder="1.750,00"
            value={tryReceivedText}
            onChange={(e) => setTryReceivedText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="fx-conv-to">Deposit to (TRY)</Label>
          <Select
            id="fx-conv-to"
            value={tryAccountId}
            onChange={(e) => setTryAccountId(e.target.value)}
          >
            {tryAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fx-conv-date">Date (DD.MM.YYYY)</Label>
          <Input
            id="fx-conv-date"
            placeholder="24.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
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
    </Dialog>
  );
}
