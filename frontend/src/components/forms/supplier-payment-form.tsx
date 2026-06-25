"use client";

/** Record supplier payment — Phase 9 Slice 3. */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

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
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Supplier payment");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadBankAndCashAccounts(entityId);
    setAccounts(merged);
    if (merged[0]) setPaymentGlAccountId(merged[0].gl_account_id);
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
    if (!paymentGlAccountId) {
      setError("Choose a cash or bank account.");
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
            payment_account_id: paymentGlAccountId,
            reference: reference || null,
          }),
        },
      );
      onPaid?.();
      toast("Payment recorded");
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
          <DateInput
            id="pay-date"
            value={dateText}
            onChange={setDateText}
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
            value={paymentGlAccountId}
            onChange={(e) => setPaymentGlAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.gl_account_id}>
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
