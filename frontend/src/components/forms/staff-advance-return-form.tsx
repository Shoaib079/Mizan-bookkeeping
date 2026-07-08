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
import {
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

/**
 * Record cash returned by an employee for an advance/overpayment.
 * TRY only — Dr cash/bank / Cr 1300 Employee Advances.
 */
export function StaffAdvanceReturnForm({
  open,
  onClose,
  employeeId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [glAccountId, setGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Advance returned");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    const list = await loadBankAndCashAccounts(entityId);
    setAccounts(list);
    const cash = list.find((a) => a.account_kind === "cash") ?? list[0];
    if (cash) setGlAccountId(cash.gl_account_id);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      submitIdempotency.resetSubmit();
      setDateText(todayTrDate());
      setAmountText("");
      setDescription("Advance returned");
      setError(null);
      void load().catch(() => undefined);
    }
  }, [open, load, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) return;
    const paymentDate = parseTrDate(dateText);
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    const amountMinor = parseTryToKurus(amountText);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!glAccountId) {
      setError("Choose the cash or bank account the money came into.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/advance-return`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_date: paymentDate,
            amount_minor: amountMinor,
            description,
            actor_id: actorId,
            payment_account_id: glAccountId,
          }),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Advance return recorded");
      onClose();
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
      title="Record advance returned (cash in)"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="ret-date">Date (DD.MM.YYYY)</Label>
          <DateInput id="ret-date" value={dateText} onChange={setDateText} required />
        </div>
        <div>
          <Label htmlFor="ret-amount">Amount (₺)</Label>
          <MoneyInput
            id="ret-amount"
            placeholder="500,00"
            value={amountText}
            onChange={setAmountText}
            required
          />
        </div>
        <div>
          <Label htmlFor="ret-account">Received into</Label>
          <Combobox
            id="ret-account"
            value={glAccountId}
            onValueChange={setGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: `${a.name} (${a.account_kind})`,
            }))}
            placeholder="Cash or bank account…"
          />
        </div>
        <div>
          <Label htmlFor="ret-desc">Description</Label>
          <Input
            id="ret-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording…" : "Record return"}
          </Button>
        </div>
      </form>
    </FormDialogShell>
  );
}
