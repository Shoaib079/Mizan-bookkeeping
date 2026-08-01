"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { CashDrawerPicker } from "@/components/forms/cash-drawer-picker";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  defaultMainDrawerId,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
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
  balanceKurus?: number;
  embedded?: boolean;
  onSaved?: () => void;
};

export function PartnerReimbursementForm({
  open,
  onClose,
  partnerId,
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
  const [cashAccounts, setCashAccounts] = useState<MoneyAccountOption[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Partner reimbursement");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const res = await apiFetch<{ items: MoneyAccountOption[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=cash&limit=50`,
    );
    const accounts = res.items;
    setCashAccounts(accounts);
    const drawerId = defaultMainDrawerId(accounts);
    if (drawerId) setCashAccountId(drawerId);
    else if (accounts[0]) setCashAccountId(accounts[0].id);
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
    const paymentAccount = cashAccounts.find((a) => a.id === cashAccountId);
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!paymentAccount) {
      setError("Choose a cash drawer.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/partners/${partnerId}/reimbursements`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_date: paymentDate,
            amount_kurus: amountKurus,
            description,
            actor_id: actorId,
            payment_account_id: paymentAccount.gl_account_id,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Reimbursement recorded");
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
      title="Pay reimbursement"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cash from the drawer only. Paying a partner from the bank is classified
          when the bank statement arrives — do not record it here.
        </p>
        <div>
          <Label htmlFor="pr-date">Payment date (DD.MM.YYYY)</Label>
          <DateInput
            id="pr-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        {balanceKurus !== undefined && balanceKurus > 0 && (
          <p className="text-sm text-muted-foreground">
            {partnerBalanceHeading(balanceKurus)}:{" "}
            {partnerBalanceAmount(balanceKurus)}
          </p>
        )}
        <div>
          <Label htmlFor="pr-amount">Amount (TRY)</Label>
          <MoneyInput
            id="pr-amount"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="pr-desc">Description</Label>
          <Input
            id="pr-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <CashDrawerPicker
          id="pr-cash"
          accounts={cashAccounts}
          value={cashAccountId}
          onValueChange={setCashAccountId}
          label="Cash drawer"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record reimbursement"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
