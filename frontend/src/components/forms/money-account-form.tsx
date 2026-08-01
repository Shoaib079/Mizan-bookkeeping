"use client";

/** Create money account — Phase 9 Slice 4. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { MoneyAccountKind } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultKind?: MoneyAccountKind;
  defaultCurrency?: string;
  /** When set, hides the type picker — use on kind-specific banking pages only. */
  fixedKind?: MoneyAccountKind;
  onSaved?: () => void;
};

const DIALOG_TITLE: Record<MoneyAccountKind, string> = {
  bank: "New bank account",
  credit_card: "New credit card",
  cash: "New cash drawer",
  foreign_currency: "New FX wallet",
};

export function MoneyAccountForm({
  open,
  onClose,
  defaultKind = "bank",
  defaultCurrency,
  fixedKind,
  onSaved,
}: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [accountKind, setAccountKind] = useState<MoneyAccountKind>(
    fixedKind ?? defaultKind,
  );
  const [currency, setCurrency] = useState(defaultCurrency ?? "USD");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountKind(fixedKind ?? defaultKind);
    setCurrency(defaultCurrency ?? "USD");
    setName("");
    setBankName("");
    setIban("");
    setLastFour("");
    setError(null);
  }, [open, defaultKind, defaultCurrency, fixedKind]);

  const effectiveKind = fixedKind ?? accountKind;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/banking/accounts`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_kind: effectiveKind,
          currency:
            effectiveKind === "foreign_currency" ? currency.toUpperCase() : null,
          name,
          bank_name: bankName || null,
          iban: iban || null,
          last_four: lastFour || null,
        }),
      });
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast(
        effectiveKind === "cash"
          ? "Cash drawer added"
          : effectiveKind === "foreign_currency"
            ? "FX wallet added"
            : "Account added",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title={DIALOG_TITLE[effectiveKind]} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {effectiveKind === "cash" && (
          <p className="text-xs text-muted-foreground">
            Each restaurant gets one TRY drawer automatically. Add another only
            if you track a separate cash float.
          </p>
        )}
        {!fixedKind && (
          <div>
            <Label htmlFor="acct-kind">Account type</Label>
            <Select
              id="acct-kind"
              value={accountKind}
              onChange={(e) =>
                setAccountKind(e.target.value as MoneyAccountKind)
              }
            >
              <option value="bank">Bank</option>
              <option value="credit_card">Credit card</option>
            </Select>
          </div>
        )}
        {effectiveKind === "foreign_currency" && (
          <div>
            <Label htmlFor="acct-currency">Currency</Label>
            <Select
              id="acct-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="acct-name">Name</Label>
          <Input
            id="acct-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {(effectiveKind === "bank" || effectiveKind === "credit_card") && (
          <div>
            <Label htmlFor="acct-bank">
              {effectiveKind === "credit_card" ? "Issuer" : "Bank name"}
            </Label>
            <Input
              id="acct-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
        )}
        {effectiveKind === "bank" && (
          <div>
            <Label htmlFor="acct-iban">IBAN (optional)</Label>
            <Input
              id="acct-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </div>
        )}
        {effectiveKind === "credit_card" && (
          <div>
            <Label htmlFor="acct-last4">Last four digits</Label>
            <Input
              id="acct-last4"
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>
    </Dialog>
  );
}
