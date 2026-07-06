"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  embedded?: boolean;
  onSaved?: () => void;
};

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

  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [extraDaysText, setExtraDaysText] = useState("1");
  const [perDayText, setPerDayText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const extraDays = useMemo(() => {
    const parsed = Number.parseInt(extraDaysText, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [extraDaysText]);

  const perDayMinor = useMemo(() => parseTryToKurus(perDayText), [perDayText]);

  const totalMinor = useMemo(() => {
    if (extraDays <= 0 || perDayMinor === null || perDayMinor <= 0) return null;
    return extraDays * perDayMinor;
  }, [extraDays, perDayMinor]);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadBankAndCashAccounts(entityId);
    setTryAccounts(merged);
    const cash = merged.find((a) => a.account_kind === "cash");
    setPaymentGlAccountId(
      cash?.gl_account_id ?? merged[0]?.gl_account_id ?? "",
    );
  }, [entityId]);

  useEffect(() => {
    if (open) {
      submitIdempotency.resetSubmit();
      setDateText(todayTrDate());
      setExtraDaysText("1");
      setPerDayText("");
      setDescription("");
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
    if (extraDays <= 0 || extraDays > 31) {
      setError("Enter extra days (1–31).");
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
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/extra-days`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      toast("Extra days payment recorded.");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      open={open}
      onClose={onClose}
      title="Extra days pay"
      embedded={embedded}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pay for work on days off. Total is days × per-day rate. Leave pay-from
          empty to accrue now and pay cash later.
        </p>

        <div>
          <Label htmlFor="extra-days-date">Payment date</Label>
          <DateInput
            id="extra-days-date"
            value={dateText}
            onChange={setDateText}
          />
        </div>

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
          <Label htmlFor="extra-days-account">Pay from (optional)</Label>
          <Combobox
            id="extra-days-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={tryAccounts.map((account) => ({
              value: account.gl_account_id,
              label: `${account.name} (${account.account_kind})`,
            }))}
            placeholder="Cash or bank account"
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
            {submitting ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </FormDialogShell>
  );
}
