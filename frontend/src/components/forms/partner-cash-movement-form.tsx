"use client";

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
import { useEntity } from "@/lib/entity-context";
import { loadBankAndCashAccounts, type MoneyAccountOption } from "@/lib/load-money-accounts";
import {
  partnerBalanceAmount,
  partnerBalanceHeading,
} from "@/lib/partner-balance";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  kind: "drawing" | "repayment";
  balanceKurus?: number;
  embedded?: boolean;
  onSaved?: () => void;
};

export function PartnerCashMovementForm({
  open,
  onClose,
  partnerId,
  kind,
  balanceKurus,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const isDrawing = kind === "drawing";

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState(
    isDrawing ? "Partner drawing" : "Partner drawing repayment",
  );
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
    const movementDate = parseTrDate(dateText);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!movementDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!paymentGlAccountId) {
      setError("Choose a cash or bank account.");
      return;
    }
    if (
      !isDrawing &&
      balanceKurus !== undefined &&
      balanceKurus >= 0
    ) {
      setError("This partner has no outstanding drawing to repay.");
      return;
    }
    if (
      !isDrawing &&
      balanceKurus !== undefined &&
      amountKurus > Math.abs(balanceKurus)
    ) {
      setError(
        `Repayment cannot exceed ${partnerBalanceAmount(Math.abs(balanceKurus))}.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const path = isDrawing ? "drawings" : "drawing-repayments";
      const body = isDrawing
        ? {
            drawing_date: movementDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            payment_account_id: paymentGlAccountId,
          }
        : {
            payment_date: movementDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            payment_account_id: paymentGlAccountId,
          };
      await apiFetch(
        `/entities/${entityId}/partners/${partnerId}/${path}`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast(isDrawing ? "Drawing recorded" : "Drawing repayment recorded");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={isDrawing ? "Record partner drawing" : "Record drawing repayment"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {balanceKurus !== undefined && (
          <p className="text-sm text-muted-foreground">
            {partnerBalanceHeading(balanceKurus)}:{" "}
            {partnerBalanceAmount(balanceKurus)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {isDrawing
            ? "Partner withdraws cash from the business — balance may go negative (partner owes you)."
            : "Partner repays cash against an outstanding drawing."}
        </p>
        <div>
          <Label htmlFor="pc-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="pc-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pc-amount">Amount (TRY)</Label>
          <MoneyInput
            id="pc-amount"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pc-desc">Description</Label>
          <Input
            id="pc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="pc-account">{isDrawing ? "Pay from" : "Receive into"}</Label>
          <Combobox
            id="pc-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: `${a.name} (${a.account_kind})`,
            }))}
            placeholder="Choose account…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : isDrawing ? "Record drawing" : "Record repayment"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
