"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { withAcknowledgeDuplicate } from "@/lib/duplicate-record";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import { parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate, calendarMonth, priorCalendarMonth } from "@/lib/dates";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  payCurrency: string;
  embedded?: boolean;
  /** Adjust-accrual flows usually target the prior salary month. */
  defaultSalaryPeriod?: "current" | "prior";
  onSaved?: () => void;
};

export function StaffAccrualForm({
  open,
  onClose,
  employeeId,
  payCurrency,
  embedded,
  defaultSalaryPeriod = "current",
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();
  const isTry = payCurrency === "TRY";
  const [dateText, setDateText] = useState("");
  const [periodYear, setPeriodYear] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("Salary accrual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const period =
      defaultSalaryPeriod === "prior"
        ? priorCalendarMonth()
        : calendarMonth();
    setDateText(todayTrDate());
    setPeriodYear(String(period.year));
    setPeriodMonth(String(period.month));
    setAmountText("");
    setDescription("Salary accrual");
    setError(null);
  }, [open, defaultSalaryPeriod]);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const amountMinor = isTry
      ? parseTryToKurus(amountText)
      : parseFxNative(amountText);
    const accrualDate = parseTrDate(dateText);
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!accrualDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      setError("Enter a valid salary year.");
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      setError("Choose a salary month.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithDuplicateGuard(async (acknowledgedDuplicate) =>
        apiFetch(
          `/entities/${entityId}/staff/employees/${employeeId}/accruals`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withAcknowledgeDuplicate(
                {
                  accrual_date: accrualDate,
                  amount_minor: amountMinor,
                  description,
                  actor_id: actorId,
                  period_year: year,
                  period_month: month,
                },
                acknowledgedDuplicate,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Salary accrued");
      onClose();
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accrual failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Salary accrual"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="acc-date">Accrual date (DD.MM.YYYY)</Label>
          <DateInput
            id="acc-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Accrues salary payable ({payCurrency}). No cash movement.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="acc-period-year">Salary year</Label>
            <Input
              id="acc-period-year"
              inputMode="numeric"
              value={periodYear}
              onChange={(e) => setPeriodYear(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="acc-period-month">Salary month</Label>
            <Select
              id="acc-period-month"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              required
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="acc-amount">Amount ({payCurrency})</Label>
          {isTry ? (
            <MoneyInput
              id="acc-amount"
              placeholder="15.000,00"
              value={amountText}
              onChange={setAmountText}
              required
            />
          ) : (
            <Input
              id="acc-amount"
              placeholder="1.000,00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              required
            />
          )}
        </div>
        <div>
          <Label htmlFor="acc-desc">Description</Label>
          <Input
            id="acc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Recording…" : "Record accrual"}
        </Button>
      </form>
    </FormDialogShell>
    <DuplicateRecordDialog />
    </>
  );
}
