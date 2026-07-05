"use client";

/** Record supplier payment — Phase 9 Slice 3; BSF-2 advances. */

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
import {
  computeSupplierAdvanceKurus,
  formatSupplierPayableBalance,
  isSupplierAdvanceBalance,
  SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS,
} from "@/lib/supplier-balance";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  balanceKurus?: number;
  embedded?: boolean;
  onPaid?: () => void;
};

export function SupplierPaymentForm({
  open,
  onClose,
  supplierId,
  balanceKurus,
  embedded,
  onPaid,
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
  const [description, setDescription] = useState("Supplier payment");
  const [reference, setReference] = useState("");
  const [confirmAdvance, setConfirmAdvance] = useState(false);
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
      setConfirmAdvance(false);
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts]);

  const amountKurus = parseTryToKurus(amountText);
  const amountInvalid =
    amountText.trim() !== "" &&
    (amountKurus === null || amountKurus <= 0);
  const currentBalance = balanceKurus ?? 0;
  const advanceKurus =
    amountKurus !== null
      ? computeSupplierAdvanceKurus(currentBalance, amountKurus)
      : 0;
  const needsAdvanceConfirm =
    advanceKurus > SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS;
  const submitBlocked =
    amountKurus === null ||
    amountKurus <= 0 ||
    (needsAdvanceConfirm && !confirmAdvance);

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
        `/entities/${entityId}/suppliers/${supplierId}/payments`,
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
            reference: reference || null,
            confirm_advance: needsAdvanceConfirm && confirmAdvance,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onPaid?.();
      toast("Payment recorded");
      onClose();
      setAmountText("");
      setReference("");
      setConfirmAdvance(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell embedded={embedded} open={open} title="Record payment" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {balanceKurus !== undefined && (
          <p className="text-sm text-muted-foreground">
            {isSupplierAdvanceBalance(balanceKurus)
              ? "Current advance: "
              : balanceKurus > 0
                ? "Outstanding balance: "
                : "Balance: "}
            {formatSupplierPayableBalance(balanceKurus)}
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
          <MoneyInput
            id="pay-amount"
            placeholder="1.500,00"
            value={amountText}
            onChange={setAmountText}
            showPreview={false}
            showInvalidHint={false}
            required
          />
          {amountInvalid && (
            <ValidationHint>Enter an amount greater than zero.</ValidationHint>
          )}
          {advanceKurus > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Creates a supplier advance of {formatTry(advanceKurus)} (invoice can
              be uploaded later).
            </p>
          )}
        </div>
        {needsAdvanceConfirm && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmAdvance}
              onChange={(e) => setConfirmAdvance(e.target.checked)}
              className="mt-1"
            />
            <span>
              Confirm this large advance — the payment exceeds the usual threshold
              and no matching invoice is on file yet.
            </span>
          </label>
        )}
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
          <Combobox
            id="pay-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: `${a.name} (${a.account_kind})`,
            }))}
            placeholder="Cash or bank account…"
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
