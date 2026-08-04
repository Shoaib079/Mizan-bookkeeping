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
import { loadCashAccounts, type MoneyAccountOption } from "@/lib/load-money-accounts";
import {
  partnerBalanceAmount,
  partnerBalanceHeading,
} from "@/lib/partner-balance";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  kind: "drawing" | "repayment" | "capital" | "profit_paid";
  /** Drawing/repayment: net/capital balance. Profit paid: unpaid allocated profit. */
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
  const isCapital = kind === "capital";
  const isRepayment = kind === "repayment";
  const isProfitPaid = kind === "profit_paid";

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const defaultDescription = isCapital
    ? ""
    : isProfitPaid
      ? "Partner profit paid"
      : isDrawing
        ? "Partner drawing"
        : "Partner drawing repayment";

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    // Manual partner money is cash-only — bank in/out is statement classify.
    const options = await loadCashAccounts(entityId);
    setAccounts(options);
    if (options[0]) setPaymentGlAccountId(options[0].gl_account_id);
    else setPaymentGlAccountId("");
  }, [entityId]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      setDescription(defaultDescription);
      setAmountText("");
      setError(null);
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts, defaultDescription]);

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
      setError(
        "Choose a cash drawer. Bank movements: classify on the bank statement.",
      );
      return;
    }
    const note = description.trim();
    if (!note) {
      setError(
        isCapital
          ? "Add a note — why did this partner invest?"
          : "Description is required.",
      );
      return;
    }
    if (isRepayment && balanceKurus !== undefined && balanceKurus >= 0) {
      setError("This partner has no outstanding drawing to repay.");
      return;
    }
    if (
      isRepayment &&
      balanceKurus !== undefined &&
      amountKurus > Math.abs(balanceKurus)
    ) {
      setError(
        `Repayment cannot exceed ${partnerBalanceAmount(Math.abs(balanceKurus))}.`,
      );
      return;
    }
    if (isProfitPaid && (balanceKurus === undefined || balanceKurus <= 0)) {
      setError("This partner has no unpaid allocated profit to pay.");
      return;
    }
    if (
      isProfitPaid &&
      balanceKurus !== undefined &&
      amountKurus > balanceKurus
    ) {
      setError(
        `Payment cannot exceed unpaid profit of ${formatTry(balanceKurus)}.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const path = isCapital
        ? "capital-contributions"
        : isProfitPaid
          ? "profit-payments"
          : isDrawing
            ? "drawings"
            : "drawing-repayments";
      const body = isCapital
        ? {
            contribution_date: movementDate,
            amount_kurus: amountKurus,
            description: note,
            actor_id: actorId,
            payment_account_id: paymentGlAccountId,
          }
        : isProfitPaid || isRepayment
          ? {
              payment_date: movementDate,
              amount_kurus: amountKurus,
              description: note,
              actor_id: actorId,
              payment_account_id: paymentGlAccountId,
            }
          : {
              drawing_date: movementDate,
              amount_kurus: amountKurus,
              description: note,
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
      toast(
        isCapital
          ? "Capital recorded"
          : isProfitPaid
            ? "Profit payment recorded"
            : isDrawing
              ? "Drawing recorded"
              : "Drawing repayment recorded",
      );
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isCapital
    ? "Record partner capital"
    : isProfitPaid
      ? "Pay partner profit"
      : isDrawing
        ? "Record partner drawing"
        : "Record drawing repayment";

  const accountLabel = isCapital || isRepayment ? "Cash drawer" : "Pay from cash";

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={title}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="pc-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="pc-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        {!isCapital && balanceKurus !== undefined && (
          <p className="text-sm text-muted-foreground">
            {isProfitPaid
              ? `Unpaid allocated profit: ${formatTry(Math.max(0, balanceKurus))}`
              : `${partnerBalanceHeading(balanceKurus)}: ${partnerBalanceAmount(balanceKurus)}`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {isCapital
            ? "Partner puts cash into the business as equity — not a loan. Bank capital: classify the statement inflow as Partner capital."
            : isProfitPaid
              ? "Pays allocated profit from cash. Bank payouts: classify the statement as Partner profit paid — do not record both."
              : isDrawing
                ? "Partner takes cash from a drawer. Bank withdrawals: classify the statement as Partner withdrawal."
                : "Partner returns cash against an outstanding drawing. Bank repayments: classify on the statement."}
        </p>
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
          <Label htmlFor="pc-desc">{isCapital ? "Note" : "Description"}</Label>
          <Input
            id="pc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder={
              isCapital
                ? "e.g. Opening cash, oven share, fridge…"
                : undefined
            }
          />
          {isCapital && (
            <p className="mt-1 text-xs text-muted-foreground">
              Saved on the partner ledger so you remember why they invested.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="pc-account">{accountLabel}</Label>
          <Combobox
            id="pc-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: a.name,
            }))}
            placeholder="Choose cash drawer…"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Bank? Wait for the statement and classify it there — never both.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Recording…"
            : isCapital
              ? "Record capital"
              : isProfitPaid
                ? "Pay profit"
                : isDrawing
                  ? "Record drawing"
                  : "Record repayment"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
