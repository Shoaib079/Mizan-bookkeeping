"use client";

/** Record the commission the bank actually charged.
 *
 * This used to book "whatever is left in card clearing", which assumed the
 * leftover WAS the commission. It isn't — it's commission plus any sales the
 * bank hasn't deposited yet, which is how a month of undeposited sales once
 * became a 184k expense. You type the figure from the statement instead, and
 * whatever remains in clearing stays there as what it really is.
 */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch, ApiError } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import {
  comparableRates,
  formatRatePercent,
  impliedRatePercent,
  ratePeriodLabel,
  type CommissionRateHistoryRead,
} from "@/lib/commission-rate";

type Props = {
  open: boolean;
  onClose: () => void;
  onCleared?: () => void;
};

export function ClearCommissionForm({ open, onClose, onCleared }: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [dateText, setDateText] = useState("");
  // Deliberately never pre-filled with the clearing residual: offering it
  // invites tapping through, which is exactly the old behaviour.
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Card commission");
  const [history, setHistory] = useState<CommissionRateHistoryRead | null>(null);
  const [cardSalesKurus, setCardSalesKurus] = useState(0);
  const [clearingKurus, setClearingKurus] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const loadContext = useCallback(async () => {
    if (!entityId) return;
    const [rates, reconciliation] = await Promise.all([
      apiFetch<CommissionRateHistoryRead>(
        `/entities/${entityId}/pos/clearing-reconciliation/commission-rates?months=6`,
      ).catch(() => null),
      apiFetch<{
        total_card_sales_kurus: number;
        clearing_balance_kurus: number;
      }>(`/entities/${entityId}/pos/clearing-reconciliation`).catch(() => null),
    ]);
    setHistory(rates);
    setCardSalesKurus(reconciliation?.total_card_sales_kurus ?? 0);
    setClearingKurus(reconciliation?.clearing_balance_kurus ?? 0);
  }, [entityId]);

  useEffect(() => {
    if (!open) return;
    setDateText(todayTrDate());
    setAmountText("");
    setError(null);
    setConfirmWarning(null);
    void loadContext();
  }, [open, loadContext]);

  const amountKurus = parseTryToKurus(amountText);
  const impliedRate = impliedRatePercent(amountKurus, cardSalesKurus);
  const priorRates = comparableRates(history);

  async function submitClear(confirm: boolean) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const clearanceDate = parseTrDate(dateText);
    if (!clearanceDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter the commission amount from your statement.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/pos/clearing-reconciliation/clear-commission`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_id: actorId,
            clearance_date: clearanceDate,
            amount_kurus: amountKurus,
            description: description.trim() || null,
            confirm,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      setConfirmWarning(null);
      onCleared?.();
      toast("Card commission recorded");
      onClose();
    } catch (err) {
      // 409 = the absurd-amount backstop, which is a question, not a failure.
      // 422 = a real refusal (more than clearing holds); show it as an error.
      if (err instanceof ApiError && err.status === 409) {
        submitIdempotency.resetSubmit();
        setConfirmWarning(err.message);
      } else {
        setConfirmWarning(null);
        setError(err instanceof Error ? err.message : "Could not record commission");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitClear(false);
  }

  return (
    <Dialog open={open} title="Record card commission" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter what the bank actually charged, from your statement. Anything
          still left in card clearing afterwards is sales the bank hasn&apos;t
          deposited yet.
        </p>

        <div>
          <Label htmlFor="commission-amount">Commission charged</Label>
          <MoneyInput
            id="commission-amount"
            className="w-48"
            placeholder="e.g. 12.400,00"
            value={amountText}
            onChange={setAmountText}
          />
          {impliedRate !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              That&apos;s{" "}
              <span className="font-medium text-foreground">
                {formatRatePercent(impliedRate)}
              </span>{" "}
              of {formatTry(cardSalesKurus)} card sales.
            </p>
          )}
          {priorRates.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Previously: {priorRates.map(ratePeriodLabel).join(" · ")}
            </p>
          )}
          {clearingKurus > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Card clearing currently holds {formatTry(clearingKurus)}.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="clear-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="clear-date"
            value={dateText}
            onChange={setDateText}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use the last day of the month it relates to. The entry posts on this
            date, and is checked against what clearing held then.
          </p>
        </div>

        <div>
          <Label htmlFor="clear-desc">Description (optional)</Label>
          <Input
            id="clear-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {confirmWarning ? (
          <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm text-warning">{confirmWarning}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => setConfirmWarning(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void submitClear(true)}
              >
                {submitting ? "Recording…" : "Proceed anyway"}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording…" : "Record commission"}
          </Button>
        )}
      </form>
    </Dialog>
  );
}
