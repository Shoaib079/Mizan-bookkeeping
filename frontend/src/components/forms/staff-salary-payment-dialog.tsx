"use client";

/** Pay salary for a month — one dialog: date, account, period, amounts. */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import {
  loadBankAndCashAccounts,
  loadForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import {
  advanceAppliedPreview,
  defaultPeriodFromDate,
  excessAdvancePreview,
  isValidStaffSalaryEmployee,
  payableClearedPreview,
  type SalaryPeriodStatus,
} from "@/lib/staff-salary";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

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

type PeriodPayload = {
  period_year: number;
  period_month: number;
  period_salary_minor: number;
  amount_minor: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entityId: string;
  employeeId: string;
  employeeName: string;
  payCurrency: string;
  /** Staff page: date + account in dialog. Statement: bank line only. */
  source?: "staff" | "statement";
  /** Inline in PeopleRecordDialog — no nested modal. */
  embedded?: boolean;
  /** ISO date — default for statement or initial staff date. */
  paymentDate?: string;
  defaultCashMinor?: number;
  lockCashAmount?: boolean;
  onConfirm?: (payload: PeriodPayload) => void | Promise<void>;
  onSaved?: () => void;
  /** When false, dialog stays open after a successful post (e.g. Expenses hub). */
  closeOnSuccess?: boolean;
  confirming?: boolean;
};

export function StaffSalaryPaymentDialog({
  open,
  onClose,
  entityId,
  employeeId,
  employeeName,
  payCurrency,
  source = "staff",
  embedded,
  paymentDate,
  defaultCashMinor,
  lockCashAmount = false,
  onConfirm,
  onSaved,
  closeOnSuccess = true,
  confirming: confirmingProp = false,
}: Props) {
  const { actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const isTry = payCurrency === "TRY";
  const isStatement = source === "statement";

  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState("Salary payment");
  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [fxAccounts, setFxAccounts] = useState<MoneyAccountOption[]>([]);
  const [fxWalletId, setFxWalletId] = useState("");
  const [tryCostText, setTryCostText] = useState("");

  const [periodYear, setPeriodYear] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [salaryText, setSalaryText] = useState("");
  const [cashText, setCashText] = useState("");
  const [status, setStatus] = useState<SalaryPeriodStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedContextRef = useRef("");

  const confirming = confirmingProp || submitting;
  const dialogOpen =
    open && isValidStaffSalaryEmployee(employeeId, employeeName);
  const dialogTitle = `Pay salary — ${employeeName}`;

  const salaryMinor = useMemo(() => {
    if (isTry) return parseTryToKurus(salaryText);
    return parseFxNative(salaryText);
  }, [isTry, salaryText]);

  const cashMinor = useMemo(() => {
    if (defaultCashMinor != null && !cashText.trim()) return defaultCashMinor;
    if (isTry) return parseTryToKurus(cashText);
    return parseFxNative(cashText);
  }, [cashText, defaultCashMinor, isTry]);

  const loadAccounts = useCallback(async () => {
    if (!entityId || isStatement) return;
    if (isTry) {
      const merged = await loadBankAndCashAccounts(entityId);
      setTryAccounts(merged);
      const cash = merged.find((a) => a.account_kind === "cash");
      setPaymentGlAccountId(
        cash?.gl_account_id ?? merged[0]?.gl_account_id ?? "",
      );
    } else {
      const wallets = await loadForeignCurrencyAccounts(entityId, payCurrency);
      setFxAccounts(wallets);
      setFxWalletId(wallets[0]?.id ?? "");
    }
  }, [entityId, isStatement, isTry, payCurrency]);

  const loadStatus = useCallback(async () => {
    if (!entityId || !employeeId || !open) return;
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;

    setLoading(true);
    setError(null);
    try {
      const query =
        salaryMinor != null && salaryMinor > 0
          ? `?period_salary_minor=${salaryMinor}`
          : "";
      const data = await apiFetch<SalaryPeriodStatus>(
        `/entities/${entityId}/staff/employees/${employeeId}/salary-periods/${year}/${month}${query}`,
      );
      setStatus(data);
      if (!salaryText.trim() && data.period_salary_minor > 0) {
        if (isTry) {
          setSalaryText(
            (data.period_salary_minor / 100)
              .toFixed(2)
              .replace(".", ",")
              .replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          );
        } else {
          setSalaryText((data.period_salary_minor / 100).toFixed(2));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load period");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [
    employeeId,
    entityId,
    isTry,
    open,
    periodMonth,
    periodYear,
    salaryMinor,
    salaryText,
  ]);

  useEffect(() => {
    if (!open) return;
    submitIdempotency.resetSubmit();
    const initialDateText = paymentDate
      ? paymentDate.split("-").reverse().join(".")
      : todayTrDate();
    const initialIso =
      paymentDate ?? parseTrDate(initialDateText) ?? "";
    const period = defaultPeriodFromDate(
      initialIso || new Date().toISOString().slice(0, 10),
    );
    setDateText(initialDateText);
    setDescription("Salary payment");
    setPeriodYear(String(period.year));
    setPeriodMonth(String(period.month));
    setSalaryText("");
    setCashText(
      defaultCashMinor != null && isTry
        ? formatTry(defaultCashMinor).replace(" TL", "")
        : defaultCashMinor != null
          ? (defaultCashMinor / 100).toFixed(2)
          : "",
    );
    setTryCostText("");
    setError(null);
    void loadAccounts().catch(() => undefined);
    // Initialize once per open — do not reset when payment date or period edits change.
  }, [
    open,
    defaultCashMinor,
    isTry,
    loadAccounts,
    paymentDate,
    submitIdempotency,
  ]);

  // Switching employee or salary period must not keep the previous amounts.
  useEffect(() => {
    if (!open) {
      loadedContextRef.current = "";
      return;
    }
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (
      !Number.isFinite(year) ||
      year < 2000 ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return;
    }
    const contextKey = `${employeeId}:${payCurrency}:${year}:${month}`;
    if (loadedContextRef.current === contextKey) return;
    loadedContextRef.current = contextKey;
    setSalaryText("");
    setCashText(
      defaultCashMinor != null && isTry
        ? formatTry(defaultCashMinor).replace(" TL", "")
        : defaultCashMinor != null
          ? (defaultCashMinor / 100).toFixed(2)
          : "",
    );
    setStatus(null);
    setTryCostText("");
    setError(null);
  }, [
    employeeId,
    payCurrency,
    periodYear,
    periodMonth,
    open,
    defaultCashMinor,
    isTry,
  ]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadStatus(), 250);
    return () => window.clearTimeout(timer);
  }, [loadStatus, open]);

  const periodRemaining = status?.period_remaining_minor ?? 0;
  const outstandingAdvance = status?.outstanding_advance_minor ?? 0;
  const cashPreview = cashMinor ?? 0;
  const advancePreview =
    cashPreview > 0
      ? advanceAppliedPreview(cashPreview, periodRemaining, outstandingAdvance)
      : 0;
  const payablePreview =
    cashPreview > 0
      ? payableClearedPreview(cashPreview, periodRemaining, outstandingAdvance)
      : 0;
  const excessPreview =
    cashPreview > 0
      ? excessAdvancePreview(cashPreview, periodRemaining, outstandingAdvance)
      : 0;

  function formatMinor(minor: number): string {
    if (isTry) return formatTry(minor);
    return `${(minor / 100).toFixed(2)} ${payCurrency}`;
  }

  async function postStaffPayment(payload: PeriodPayload) {
    const paymentDateParsed = parseTrDate(dateText);
    if (!paymentDateParsed) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (isTry && !paymentGlAccountId) {
      setError("Choose a cash or bank account.");
      return;
    }
    if (!isTry && !fxWalletId) {
      setError(`No ${payCurrency} wallet found.`);
      return;
    }

    const body: Record<string, unknown> = {
      payment_date: paymentDateParsed,
      amount_minor: payload.amount_minor,
      description,
      actor_id: actorId,
      period_year: payload.period_year,
      period_month: payload.period_month,
      period_salary_minor: payload.period_salary_minor,
    };
    if (isTry) {
      body.payment_account_id = paymentGlAccountId;
    } else {
      const tryCostKurus = parseTryToKurus(tryCostText);
      if (tryCostKurus === null || tryCostKurus <= 0) {
        setError("Enter a valid TRY cost for this payment.");
        return;
      }
      body.fx_money_account_id = fxWalletId;
      body.try_cost_kurus = tryCostKurus;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(
        `/entities/${entityId}/staff/employees/${employeeId}/payments`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      toast("Payment recorded");
      onSaved?.();
      setCashText("");
      if (!closeOnSuccess) {
        void loadStatus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (salaryMinor == null || salaryMinor <= 0) {
      setError("Enter the salary amount for this month.");
      return;
    }
    if (cashMinor == null || cashMinor <= 0) {
      setError("Enter how much you are paying now.");
      return;
    }
    if (!Number.isFinite(year) || year < 2000) {
      setError("Enter a valid salary year.");
      return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      setError("Choose a salary month.");
      return;
    }

    const payload: PeriodPayload = {
      period_year: year,
      period_month: month,
      period_salary_minor: salaryMinor,
      amount_minor: cashMinor,
    };

    setError(null);
    if (isStatement && onConfirm) {
      await onConfirm(payload);
      return;
    }
    await postStaffPayment(payload);
  }

  if (!dialogOpen) return null;

  const form = (
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Mizan accrues this month&apos;s salary when needed — no separate accrual
          step. Pay any prior month; pay in parts as cash comes in; extra becomes
          advance.
        </p>

        {!isStatement && (
          <>
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
              <Label htmlFor="pay-desc">Description</Label>
              <Input
                id="pay-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            {isTry ? (
              <div>
                <Label htmlFor="pay-account">Pay from</Label>
                <Combobox
                  id="pay-account"
                  value={paymentGlAccountId}
                  onValueChange={setPaymentGlAccountId}
                  options={tryAccounts.map((a) => ({
                    value: a.gl_account_id,
                    label: `${a.name} (${a.account_kind})`,
                  }))}
                  placeholder="Pay from account…"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="pay-fx-wallet">{payCurrency} wallet</Label>
                  <Combobox
                    id="pay-fx-wallet"
                    value={fxWalletId}
                    onValueChange={setFxWalletId}
                    options={
                      fxAccounts.length === 0
                        ? [{ value: "", label: `No ${payCurrency} wallet` }]
                        : fxAccounts.map((a) => ({
                            value: a.id,
                            label: a.name,
                          }))
                    }
                    placeholder={`${payCurrency} wallet…`}
                    disabled={fxAccounts.length === 0}
                  />
                </div>
                <div>
                  <Label htmlFor="pay-try-cost">TRY cost</Label>
                  <MoneyInput
                    id="pay-try-cost"
                    placeholder="35.000,00"
                    value={tryCostText}
                    onChange={setTryCostText}
                    required
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pay-period-year">Salary year</Label>
            <Input
              id="pay-period-year"
              inputMode="numeric"
              value={periodYear}
              onChange={(e) => setPeriodYear(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="pay-period-month">Salary month (which month you are paying for)</Label>
            <Select
              id="pay-period-month"
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
            <p className="mt-1 text-xs text-muted-foreground">
              Can differ from payment date — e.g. pay June salary in July.
            </p>
          </div>
        </div>
        <div>
          <Label htmlFor="pay-salary-amount">Salary for this month ({payCurrency})</Label>
          {isTry ? (
            <MoneyInput
              id="pay-salary-amount"
              placeholder="15.000,00"
              value={salaryText}
              onChange={setSalaryText}
              required
            />
          ) : (
            <Input
              id="pay-salary-amount"
              value={salaryText}
              onChange={(e) => setSalaryText(e.target.value)}
              required
            />
          )}
        </div>
        <div>
          <Label htmlFor="pay-cash-amount">Paying now ({payCurrency})</Label>
          {isTry ? (
            <MoneyInput
              id="pay-cash-amount"
              placeholder="5.000,00"
              value={cashText}
              onChange={setCashText}
              required
              disabled={lockCashAmount}
            />
          ) : (
            <Input
              id="pay-cash-amount"
              value={cashText}
              onChange={(e) => setCashText(e.target.value)}
              required
              disabled={lockCashAmount}
            />
          )}
        </div>
        {status && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              Already paid this month:{" "}
              <span className="font-medium tabular-nums">
                {formatMinor(status.period_paid_minor)}
              </span>
            </p>
            <p className="mt-1">
              Still owed for month:{" "}
              <span className="font-medium tabular-nums">
                {formatMinor(periodRemaining)}
              </span>
            </p>
            {outstandingAdvance > 0 && (
              <p className="mt-1 text-muted-foreground">
                Outstanding advance:{" "}
                <span className="tabular-nums">{formatMinor(outstandingAdvance)}</span>
              </p>
            )}
            {cashPreview > 0 && payablePreview > 0 && (
              <p className="mt-2 text-muted-foreground">
                Salary payable cleared:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMinor(payablePreview)}
                </span>
                {advancePreview > 0 && (
                  <>
                    {" "}
                    (includes{" "}
                    <span className="tabular-nums">{formatMinor(advancePreview)}</span>{" "}
                    advance)
                  </>
                )}
              </p>
            )}
            {excessPreview > 0 && (
              <p className="mt-1 text-muted-foreground">
                Excess recorded as advance:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMinor(excessPreview)}
                </span>
              </p>
            )}
          </div>
        )}
        {loading && (
          <p className="text-xs text-muted-foreground">Loading period…</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button type="submit" disabled={confirming || loading}>
            {confirming ? "Posting…" : "Post salary payment"}
          </Button>
        </div>
      </form>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{dialogTitle}</h3>
        {form}
      </div>
    );
  }

  return (
    <Dialog
      open={dialogOpen}
      title={dialogTitle}
      onClose={onClose}
      className="max-w-lg"
    >
      {form}
    </Dialog>
  );
}
