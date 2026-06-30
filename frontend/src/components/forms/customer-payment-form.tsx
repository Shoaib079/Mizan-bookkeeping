"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
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
  customerId: string;
  balanceKurus?: number;
  embedded?: boolean;
  onSaved?: () => void;
};

export function CustomerPaymentForm({
  open,
  onClose,
  customerId,
  balanceKurus,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Customer payment");
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

  const amountKurus = parseTryToKurus(amountText);
  const amountInvalid =
    amountText.trim() !== "" &&
    (amountKurus === null || amountKurus <= 0);
  const overBalance =
    balanceKurus !== undefined &&
    balanceKurus > 0 &&
    amountKurus !== null &&
    amountKurus > balanceKurus;
  const submitBlocked =
    amountKurus === null || amountKurus <= 0 || overBalance;

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
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/customers/${customerId}/payments`,
        {
          method: "POST",
        idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_date: paymentDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            payment_account_id: paymentGlAccountId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Payment received");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Record customer payment"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {balanceKurus !== undefined && balanceKurus > 0 && (
          <p className="text-sm text-muted-foreground">
            Outstanding receivable: {formatTry(balanceKurus)}
          </p>
        )}
        <div>
          <Label htmlFor="cp-date">Payment date (DD.MM.YYYY)</Label>
          <DateInput
            id="cp-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="cp-amount">Amount (TRY)</Label>
          <MoneyInput
            id="cp-amount"
            value={amountText}
            onChange={setAmountText}
            showPreview={false}
            showInvalidHint={false}
            required
          />
          {amountInvalid && (
            <ValidationHint>Enter an amount greater than zero.</ValidationHint>
          )}
          {overBalance && balanceKurus !== undefined && (
            <ValidationHint>
              Amount cannot exceed outstanding receivable ({formatTry(balanceKurus)}).
            </ValidationHint>
          )}
        </div>
        <div>
          <Label htmlFor="cp-desc">Description</Label>
          <Input
            id="cp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cp-account">Receive into</Label>
          <Combobox
            id="cp-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: `${a.name} (${a.account_kind})`,
            }))}
            placeholder="Receive to account…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
