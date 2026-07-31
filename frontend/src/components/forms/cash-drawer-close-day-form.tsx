"use client";

/** Cash drawer EOD close by date — optional session reconcile (Phase 11.13). */

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ApiError, apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import type { MoneyAccountLeaf } from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { cn } from "@/lib/utils";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  defaultCashAccountId?: string;
  defaultSessionDate?: string;
  onClosed?: () => void;
};

export function CashDrawerCloseDayForm({
  open,
  onClose,
  embedded = false,
  defaultCashAccountId,
  defaultSessionDate,
  onClosed,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountLeaf[]>([]);
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [countedText, setCountedText] = useState("");
  const [description, setDescription] = useState("Cash drawer EOD close");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const cashRes = await apiFetch<{ items: MoneyAccountLeaf[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    setCashAccounts(cashRes.items.filter((a) => a.is_active));
    if (defaultCashAccountId) setMoneyAccountId(defaultCashAccountId);
    else if (cashRes.items[0]) setMoneyAccountId(cashRes.items[0].id);
  }, [entityId, defaultCashAccountId]);

  useEffect(() => {
    if (open) {
      setDateText(defaultSessionDate ?? todayTrDate());
      void loadAccounts().catch(() => undefined);
    }
  }, [open, defaultSessionDate, loadAccounts]);

  /** What the books say should be in the drawer — the same GL balance the
   * backend uses to compute over/short, so the preview can't disagree with
   * what gets posted. */
  const selectedAccount = cashAccounts.find((a) => a.id === moneyAccountId);
  const expectedKurus = selectedAccount?.balance_kurus ?? null;
  const countedPreviewKurus = parseTryToKurus(countedText);
  const overShortKurus =
    expectedKurus !== null && countedPreviewKurus !== null
      ? countedPreviewKurus - expectedKurus
      : null;

  async function submitClose(confirmLargeVariance: boolean) {
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const countedKurus = parseTryToKurus(countedText);
    const sessionDate = parseTrDate(dateText);
    if (countedKurus === null || countedKurus < 0) {
      setError("Enter a valid counted balance.");
      return;
    }
    if (!sessionDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/cash/drawer-sessions/close-day`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          money_account_id: moneyAccountId,
          session_date: sessionDate,
          counted_balance_kurus: countedKurus,
          actor_id: actorId,
          description,
          confirm_large_variance: confirmLargeVariance,
        }),
      });
      submitIdempotency.completeSubmit();
      setConfirmWarning(null);
      onClosed?.();
      toast("Drawer day closed");
      if (!embedded) onClose();
      setCountedText("");
    } catch (err) {
      // 409 = variance guard: offer confirmation instead of a dead error.
      if (err instanceof ApiError && err.status === 409) {
        submitIdempotency.resetSubmit();
        setConfirmWarning(err.message);
      } else {
        setConfirmWarning(null);
        setError(err instanceof Error ? err.message : "Close failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitClose(false);
  }

  if (!open) return null;

  const formBody = (
    <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="close-day-date">Session date (DD.MM.YYYY)</Label>
          <DateInput
            id="close-day-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Count the drawer for a day, compare to the ledger balance, and post
          over/short to 5400. Links any movements recorded that day.
        </p>
        <div>
          <Label htmlFor="close-day-acct">Cash account</Label>
          <Combobox
            id="close-day-acct"
            value={moneyAccountId}
            onValueChange={setMoneyAccountId}
            options={cashAccounts.map((a) => ({
              value: a.id,
              label: a.name,
            }))}
            placeholder="Cash account…"
          />
        </div>
        {expectedKurus !== null && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Should be in the drawer
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatTry(expectedKurus)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cash sales and money in, less expenses and money out, as recorded.
            </p>
          </div>
        )}
        <div>
          <Label htmlFor="close-day-counted">Counted balance (TRY)</Label>
          <MoneyInput
            id="close-day-counted"
            placeholder="2.350,00"
            value={countedText}
            onChange={setCountedText}
            required
          />
        </div>
        {overShortKurus !== null && (
          <div
            className={cn(
              "flex items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm",
              overShortKurus === 0 && "bg-success/10 text-success",
              overShortKurus > 0 && "bg-warning/10 text-warning",
              overShortKurus < 0 && "bg-destructive/10 text-destructive",
            )}
          >
            <span>
              {overShortKurus === 0
                ? "Drawer matches the books"
                : overShortKurus > 0
                  ? "Over — more cash than expected"
                  : "Short — less cash than expected"}
            </span>
            <span className="font-semibold tabular-nums">
              {overShortKurus > 0 ? "+" : ""}
              {formatTry(overShortKurus)}
            </span>
          </div>
        )}
        <div>
          <Label htmlFor="close-day-desc">Description</Label>
          <Input
            id="close-day-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {confirmWarning ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">{confirmWarning}</p>
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
                onClick={() => void submitClose(true)}
              >
                {submitting ? "Closing…" : "Post anyway"}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Closing…" : "Close drawer day"}
          </Button>
        )}
      </form>
  );

  if (embedded) return formBody;

  return (
    <Dialog open={open} title="Close drawer day" onClose={onClose}>
      {formBody}
    </Dialog>
  );
}
