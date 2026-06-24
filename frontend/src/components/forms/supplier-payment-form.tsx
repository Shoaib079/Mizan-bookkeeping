"use client";

/** Record supplier payment — Phase 9 Slice 3. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";

type MoneyAccount = { id: string; name: string; account_kind: string };

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  balanceKurus?: number;
  onPaid?: () => void;
};

export function SupplierPaymentForm({
  open,
  onClose,
  supplierId,
  balanceKurus,
  onPaid,
}: Props) {
  const { entityId, actorId } = useEntity();
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Supplier payment");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const [bankRes, cashRes] = await Promise.all([
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
      ),
      apiFetch<{ items: MoneyAccount[] }>(
        `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
      ),
    ]);
    const merged = [...bankRes.items, ...cashRes.items];
    setAccounts(merged);
    if (merged[0]) setPaymentAccountId(merged[0].id);
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
    const amountKurus = parseTryToKurus(amountText);
    const paymentDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/suppliers/${supplierId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_date: paymentDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            payment_account_id: paymentAccountId,
            reference: reference || null,
          }),
        },
      );
      onPaid?.();
      onClose();
      setAmountText("");
      setReference("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Record payment" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {balanceKurus !== undefined && balanceKurus > 0 && (
          <p className="text-sm text-muted-foreground">
            Outstanding balance: {formatTry(balanceKurus)}
          </p>
        )}
        <div>
          <Label htmlFor="pay-date">Payment date (DD.MM.YYYY)</Label>
          <Input
            id="pay-date"
            placeholder="24.06.2026"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pay-amount">Amount (TRY)</Label>
          <Input
            id="pay-amount"
            placeholder="1.500,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pay-desc">Description</Label>
          <Input
            id="pay-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pay-ref">Reference (optional)</Label>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="pay-account">Pay from</Label>
          <Select
            id="pay-account"
            value={paymentAccountId}
            onChange={(e) => setPaymentAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.account_kind})
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </Dialog>
  );
}
