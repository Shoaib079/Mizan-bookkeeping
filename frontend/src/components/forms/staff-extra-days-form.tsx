"use client";

/** Extra days — default accrues to salaries payable; optional cash/bank pays now. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import {
  loadCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";
import { parseStrictExtraDays } from "@/lib/staff-salary";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

const ACCRUE_VALUE = "";

export function StaffExtraDaysForm({
  open,
  onClose,
  employeeId,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();

  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState(ACCRUE_VALUE);
  const [dateText, setDateText] = useState("");
  const [extraDaysText, setExtraDaysText] = useState("1");
  const [perDayText, setPerDayText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const extraDays = useMemo(
    () => parseStrictExtraDays(extraDaysText),
    [extraDaysText],
  );

  const perDayMinor = useMemo(() => parseTryToKurus(perDayText), [perDayText]);

  const totalMinor = useMemo(() => {
    if (extraDays === null || perDayMinor === null || perDayMinor <= 0) {
      return null;
    }
    return extraDays * perDayMinor;
  }, [extraDays, perDayMinor]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    setTryAccounts(await loadCashAccounts(entityId));
    // Default accrue — do not auto-select a cash account.
    setPaymentGlAccountId(ACCRUE_VALUE);
  }, [entityId]);

  useEffect(() => {
    if (open) {
      submitIdempotency.resetSubmit();
      setDateText(todayTrDate());
      setExtraDaysText("1");
      setPerDayText("");
      setDescription("");
      setPaymentGlAccountId(ACCRUE_VALUE);
      setError(null);
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const paymentDate = parseTrDate(dateText);
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (extraDays === null) {
      setError("Enter extra days as a whole number from 1 to 31.");
      return;
    }
    if (perDayMinor === null || perDayMinor <= 0) {
      setError("Enter a valid per-day pay amount.");
      return;
    }

    const body: Record<string, unknown> = {
      payment_date: paymentDate,
      extra_days: extraDays,
      per_day_minor: perDayMinor,
      actor_id: actorId,
    };
    if (paymentGlAccountId) {
      body.payment_account_id = paymentGlAccountId;
    }
    if (description.trim()) {
      body.description = description.trim();
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithDuplicateGuard(async (acknowledgedDuplicate) =>
        apiFetch(
          `/entities/${entityId}/staff/employees/${employeeId}/extra-days`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withAcknowledgeDuplicate(body, acknowledgedDuplicate),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      toast(
        paymentGlAccountId
          ? "Extra days paid."
          : "Extra days accrued — pay with salary later.",
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  const payOptions = [
    { value: ACCRUE_VALUE, label: "Accrue — pay cash later" },
    ...tryAccounts.map((account) => ({
      value: account.gl_account_id,
      label: `${account.name} (${account.account_kind})`,
    })),
  ];

  return (
    <>
      <FormDialogShell
        open={open}
        onClose={onClose}
        title="Extra days"
        embedded={embedded}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="extra-days-date">Date</Label>
            <DateInput
              id="extra-days-date"
              value={dateText}
              onChange={setDateText}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Days off worked × per-day rate. Defaults to accruing (adds to salary
            owed); pick a cash or bank account only if paying now.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="extra-days-count">Extra days worked</Label>
              <Input
                id="extra-days-count"
                type="number"
                min={1}
                max={31}
                step={1}
                value={extraDaysText}
                onChange={(event) => setExtraDaysText(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="extra-days-rate">Pay per day (₺)</Label>
              <MoneyInput
                id="extra-days-rate"
                value={perDayText}
                onChange={setPerDayText}
              />
            </div>
          </div>

          {totalMinor !== null && (
            <p className="text-sm font-medium tabular-nums">
              Total: {formatTry(totalMinor)}
            </p>
          )}

          <div>
            <Label htmlFor="extra-days-account">Pay from</Label>
            <Combobox
              id="extra-days-account"
              value={paymentGlAccountId}
              onValueChange={setPaymentGlAccountId}
              options={payOptions}
              placeholder="Accrue — pay cash later"
            />
          </div>

          <div>
            <Label htmlFor="extra-days-note">Note (optional)</Label>
            <Input
              id="extra-days-note"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Weekend cover — May 2026"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : paymentGlAccountId
                  ? "Pay now"
                  : "Accrue"}
            </Button>
          </div>
        </form>
      </FormDialogShell>
      <DuplicateRecordDialog />
    </>
  );
}
