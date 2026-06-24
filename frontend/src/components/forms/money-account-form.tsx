"use client";

/** Create money account — Phase 9 Slice 4. */

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { MoneyAccountKind } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultKind?: MoneyAccountKind;
  defaultCurrency?: string;
  onSaved?: () => void;
};

export function MoneyAccountForm({
  open,
  onClose,
  defaultKind = "bank",
  defaultCurrency,
  onSaved,
}: Props) {
  const { entityId } = useEntity();
  const [accountKind, setAccountKind] = useState<MoneyAccountKind>(defaultKind);
  const [currency, setCurrency] = useState(defaultCurrency ?? "USD");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountKind(defaultKind);
    setCurrency(defaultCurrency ?? "USD");
    setName("");
    setBankName("");
    setIban("");
    setLastFour("");
    setError(null);
  }, [open, defaultKind, defaultCurrency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/entities/${entityId}/banking/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_kind: accountKind,
          currency:
            accountKind === "foreign_currency" ? currency.toUpperCase() : null,
          name,
          bank_name: bankName || null,
          iban: iban || null,
          last_four: lastFour || null,
        }),
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="New account" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
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
            <option value="cash">Cash</option>
            <option value="credit_card">Credit card</option>
            <option value="foreign_currency">Foreign currency wallet</option>
          </Select>
        </div>
        {accountKind === "foreign_currency" && (
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
        {(accountKind === "bank" || accountKind === "credit_card") && (
          <div>
            <Label htmlFor="acct-bank">
              {accountKind === "credit_card" ? "Issuer" : "Bank name"}
            </Label>
            <Input
              id="acct-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
        )}
        {accountKind === "bank" && (
          <div>
            <Label htmlFor="acct-iban">IBAN (optional)</Label>
            <Input
              id="acct-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </div>
        )}
        {accountKind === "credit_card" && (
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
