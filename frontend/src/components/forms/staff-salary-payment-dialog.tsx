"use client";

/** Pay salary for a month — one dialog: date, account, period, amounts. */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { StaffSalaryFxPaymentFields } from "@/components/forms/staff-salary-fx-payment-fields";
import {
  StaffSalaryFundingFields,
  type SalaryFundingMode,
} from "@/components/forms/staff-salary-funding-fields";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { parseFxNative } from "@/lib/fx-money";
import {
  loadCashAccounts,
  mainTillAccount,
  loadForeignCurrencyAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import {
  advanceAppliedPreview,
  defaultPeriodFromDate,
  excessAdvancePreview,
  formatCashPrefill,
  isValidStaffSalaryEmployee,
  netToPayMinor,
  parseStrictExtraDays,
  payableClearedPreview,
  type SalaryPeriodStatus,
} from "@/lib/staff-salary";
import {
  postStaffSalaryPayment,
  type PeriodPayload,
} from "@/lib/staff-salary-payment-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
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
  /** Parent owns date (e.g. Expenses salary mode) — field hidden, date not reset on employee change. */
  hidePaymentDate?: boolean;
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
  hidePaymentDate = false,
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
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();
  const isTry = payCurrency === "TRY";
  const isStatement = source === "statement";

  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState("Salary payment");
  const [tryAccounts, setTryAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [fundingMode, setFundingMode] = useState<SalaryFundingMode>("cash");
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [fxAccounts, setFxAccounts] = useState<MoneyAccountOption[]>([]);
  const [fxWalletId, setFxWalletId] = useState("");
  const [tryCostText, setTryCostText] = useState("");

  const [periodYear, setPeriodYear] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [salaryText, setSalaryText] = useState("");
  const [cashText, setCashText] = useState("");
  const [extraDaysText, setExtraDaysText] = useState("");
  const [extraDayRateText, setExtraDayRateText] = useState("");
  const [status, setStatus] = useState<SalaryPeriodStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedContextRef = useRef("");
  const cashPrefillRef = useRef("");

  const confirming = confirmingProp || submitting;
  const dialogOpen =
    open && isValidStaffSalaryEmployee(employeeId, employeeName);
  const dialogTitle = `Pay salary — ${employeeName}`;

  const salaryMinor = useMemo(() => {
    if (isTry) return parseTryToKurus(salaryText);
    return parseFxNative(salaryText);
  }, [isTry, salaryText]);

  const cashMinor = useMemo(() => {
    if (!cashText.trim()) return 0;
    if (defaultCashMinor != null && !cashText.trim()) return defaultCashMinor;
    if (isTry) return parseTryToKurus(cashText);
    return parseFxNative(cashText);
  }, [cashText, defaultCashMinor, isTry]);

  const extraDays = useMemo(
    () => parseStrictExtraDays(extraDaysText) ?? 0,
    [extraDaysText],
  );
  const extraDaysInvalid =
    extraDaysText.trim() !== "" && parseStrictExtraDays(extraDaysText) === null;

  const extraDayRateMinor = useMemo(
    () => parseTryToKurus(extraDayRateText),
    [extraDayRateText],
  );

  const extraDaysTotalMinor = useMemo(() => {
    if (extraDays <= 0 || extraDayRateMinor === null || extraDayRateMinor <= 0) {
      return null;
    }
    return extraDays * extraDayRateMinor;
  }, [extraDays, extraDayRateMinor]);

  const resolvedDateText = useMemo(() => {
    if (hidePaymentDate && paymentDate) {
      return paymentDate.split("-").reverse().join(".");
    }
    return dateText;
  }, [dateText, hidePaymentDate, paymentDate]);

  const loadAccounts = useCallback(async () => {
    if (!entityId || isStatement) return;
    if (isTry) {
      const [cash, partnerPage] = await Promise.all([
        loadCashAccounts(entityId),
        apiFetch<{ items: { id: string; name: string }[] }>(
          `/entities/${entityId}/partners?limit=50`,
        ),
      ]);
      setTryAccounts(cash);
      // Main Drawer, not whichever cash account the API listed first — that
      // was "Home". `mainTillAccount` is the counter till by name, never the
      // home/safe drawer, which is the same rule Count cash and Close day use.
      const till = mainTillAccount(cash) ?? cash[0];
      setPaymentGlAccountId(till?.gl_account_id ?? "");
      setPartners(partnerPage.items ?? []);
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
        setSalaryText(formatCashPrefill(data.period_salary_minor, isTry));
      }
      // Prefill cash with net-to-pay once per employee/period (don't fight edits).
      const prefillKey = `${employeeId}:${year}:${month}`;
      if (
        defaultCashMinor == null &&
        !lockCashAmount &&
        cashPrefillRef.current !== prefillKey
      ) {
        cashPrefillRef.current = prefillKey;
        const owed = data.total_owed_minor ?? data.period_remaining_minor;
        const net = netToPayMinor(owed, data.outstanding_advance_minor);
        setCashText(formatCashPrefill(net, isTry));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load period");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [
    defaultCashMinor,
    employeeId,
    entityId,
    isTry,
    lockCashAmount,
    open,
    periodMonth,
    periodYear,
    salaryMinor,
    salaryText,
  ]);

  useEffect(() => {
    if (!open) return;
    submitIdempotency.resetSubmit();
    if (!hidePaymentDate) {
      const initialDateText = paymentDate
        ? paymentDate.split("-").reverse().join(".")
        : todayTrDate();
      const initialIso =
        paymentDate ?? parseTrDate(initialDateText) ?? "";
      const period = defaultPeriodFromDate(
        initialIso || new Date().toISOString().slice(0, 10),
      );
      setDateText(initialDateText);
      setPeriodYear(String(period.year));
      setPeriodMonth(String(period.month));
    }
    setDescription("Salary payment");
    setFundingMode("cash");
    setPartnerId("");
    setSalaryText("");
    setCashText(
      defaultCashMinor != null && isTry
        ? formatTry(defaultCashMinor).replace(" TL", "")
        : defaultCashMinor != null
          ? (defaultCashMinor / 100).toFixed(2)
          : "",
    );
    setExtraDaysText("");
    setExtraDayRateText("");
    setTryCostText("");
    setError(null);
    void loadAccounts().catch(() => undefined);
    // Initialize once per open — do not reset when payment date or period edits change.
  }, [
    open,
    defaultCashMinor,
    hidePaymentDate,
    isTry,
    loadAccounts,
    paymentDate,
    submitIdempotency,
  ]);

  useEffect(() => {
    if (!open || hidePaymentDate || !dateText) return;
    const iso = parseTrDate(dateText);
    if (!iso) return;
    const period = defaultPeriodFromDate(iso);
    setPeriodYear(String(period.year));
    setPeriodMonth(String(period.month));
  }, [dateText, hidePaymentDate, open]);

  useEffect(() => {
    if (!open || !hidePaymentDate || !paymentDate) return;
    const period = defaultPeriodFromDate(paymentDate);
    setPeriodYear(String(period.year));
    setPeriodMonth(String(period.month));
  }, [hidePaymentDate, open, paymentDate]);

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
    cashPrefillRef.current = "";
    setSalaryText("");
    setCashText(
      defaultCashMinor != null
        ? formatCashPrefill(defaultCashMinor, isTry)
        : "",
    );
    setExtraDaysText("");
    setExtraDayRateText("");
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
  // Advances net against everything owed (incl. extra days typed in this form).
  const owedPreview =
    (status?.total_owed_minor ?? periodRemaining) + (extraDaysTotalMinor ?? 0);
  const cashPreview = cashMinor ?? 0;
  const settlePreviewActive =
    owedPreview > 0 || outstandingAdvance > 0 || cashPreview > 0;
  const advancePreview = settlePreviewActive
    ? advanceAppliedPreview(cashPreview, owedPreview, outstandingAdvance)
    : 0;
  const payablePreview = settlePreviewActive
    ? payableClearedPreview(cashPreview, owedPreview, outstandingAdvance)
    : 0;
  const excessPreview =
    cashPreview > 0
      ? excessAdvancePreview(cashPreview, owedPreview)
      : 0;
  const suggestedNet = netToPayMinor(owedPreview, outstandingAdvance);

  function formatMinor(minor: number): string {
    if (isTry) return formatTry(minor);
    return `${(minor / 100).toFixed(2)} ${payCurrency}`;
  }

  async function postStaffPayment(payload: PeriodPayload) {
    setError(null);
    const result = await postStaffSalaryPayment({
      entityId,
      employeeId,
      actorId,
      description,
      dateText: resolvedDateText,
      isTry,
      payCurrency,
      fundingMode,
      partnerId,
      paymentGlAccountId,
      fxWalletId,
      tryCostText,
      payload,
      beginSubmit: () => submitIdempotency.beginSubmit(),
      submitWithDuplicateGuard,
    });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    const cash = cashMinor ?? 0;
    const hasSalary = salaryMinor != null && salaryMinor > 0;
    const hasExtra =
      isTry &&
      extraDays > 0 &&
      extraDayRateMinor !== null &&
      extraDayRateMinor > 0;

    if (extraDaysInvalid) {
      setError("Extra days must be a whole number from 1 to 31.");
      return;
    }
    if (!hasSalary) {
      setError("Enter salary for this month.");
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
    if (
      !isStatement &&
      cash > 0 &&
      isTry &&
      fundingMode === "cash" &&
      !paymentGlAccountId
    ) {
      setError("Choose a cash or bank account.");
      return;
    }
    if (!isStatement && cash > 0 && isTry && fundingMode === "partner" && !partnerId) {
      setError("Choose the partner who paid.");
      return;
    }
    if (!isStatement && cash > 0 && !isTry && !fxWalletId) {
      setError(`No ${payCurrency} wallet found.`);
      return;
    }
    if (hasExtra && (extraDayRateMinor === null || extraDayRateMinor <= 0)) {
      setError("Enter a valid per-day pay for extra days.");
      return;
    }

    setError(null);
    if (isStatement && onConfirm) {
      await onConfirm({
        period_year: year,
        period_month: month,
        period_salary_minor: salaryMinor!,
        amount_minor: cash,
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const ok = await postStaffPayment({
        period_year: year,
        period_month: month,
        period_salary_minor: salaryMinor!,
        amount_minor: cash,
        ...(hasExtra
          ? { extra_days: extraDays, per_day_minor: extraDayRateMinor! }
          : {}),
      });
      if (!ok) return;
      submitIdempotency.completeSubmit();
      toast(cash > 0 ? "Payment recorded" : "Salary recorded");
      onSaved?.();
      setCashText("");
      setExtraDaysText("");
      setExtraDayRateText("");
      if (!closeOnSuccess) {
        void loadStatus();
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!dialogOpen) return null;

  const form = (
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        {!isStatement && !hidePaymentDate && (
          <div>
            <Label htmlFor="pay-date">Payment date (DD.MM.YYYY)</Label>
            <DateInput
              id="pay-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Accrues this month&apos;s salary when needed. Cash defaults to net to
          pay (owed minus advance). Paying more than owed parks the rest as
          advance.
        </p>

        {!isStatement && !hidePaymentDate && (
          <div>
            <Label htmlFor="pay-desc">Description</Label>
            <Input
              id="pay-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
        )}

        {!isStatement &&
          (isTry ? (
            <StaffSalaryFundingFields
              fundingMode={fundingMode}
              onFundingModeChange={setFundingMode}
              tryAccounts={tryAccounts}
              paymentGlAccountId={paymentGlAccountId}
              onPaymentGlAccountIdChange={setPaymentGlAccountId}
              partners={partners}
              partnerId={partnerId}
              onPartnerIdChange={setPartnerId}
              showAccountRequiredHint={cashPreview <= 0}
            />
          ) : (
            <StaffSalaryFxPaymentFields
              payCurrency={payCurrency}
              fxAccounts={fxAccounts}
              fxWalletId={fxWalletId}
              onFxWalletIdChange={setFxWalletId}
              tryCostText={tryCostText}
              onTryCostTextChange={setTryCostText}
            />
          ))}

        {isStatement && cashPreview > 0 && (
          <p className="text-xs text-muted-foreground">
            Payment posts from this bank statement — no cash or bank pick needed.
          </p>
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
              placeholder="e.g. 15.000,00"
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
          <Label htmlFor="pay-cash-amount">
            Paying now ({payCurrency})
            {suggestedNet > 0 ? " — net to pay" : " — optional"}
          </Label>
          {isTry ? (
            <MoneyInput
              id="pay-cash-amount"
              placeholder="e.g. 5.000,00"
              value={cashText}
              onChange={setCashText}
              disabled={lockCashAmount}
            />
          ) : (
            <Input
              id="pay-cash-amount"
              value={cashText}
              onChange={(e) => setCashText(e.target.value)}
              disabled={lockCashAmount}
            />
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Leave empty to record salary only — pay cash later. Prefills with
            net to pay when an advance is held.
          </p>
        </div>
        {isTry && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pay-extra-days">Extra days worked</Label>
                <Input
                  id="pay-extra-days"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  value={extraDaysText}
                  onChange={(e) => setExtraDaysText(e.target.value)}
                  placeholder="e.g. 3"
                />
                {extraDaysInvalid && (
                  <p className="mt-1 text-xs text-destructive">
                    Whole number from 1 to 31 only.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="pay-extra-day-rate">Extra day pay (₺)</Label>
                <MoneyInput
                  id="pay-extra-day-rate"
                  value={extraDayRateText}
                  onChange={setExtraDayRateText}
                  placeholder="e.g. 1.500,00"
                />
              </div>
            </div>
            {extraDaysTotalMinor !== null && (
              <p className="text-sm font-medium tabular-nums">
                Extra days total: {formatTry(extraDaysTotalMinor)} — accrued in
                this same payment
              </p>
            )}
          </>
        )}
        {status && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              Salary owed:{" "}
              <span className="font-medium tabular-nums">
                {formatMinor(owedPreview)}
              </span>
              {periodRemaining !== owedPreview && (
                <span className="text-muted-foreground">
                  {" "}
                  (month remaining {formatMinor(periodRemaining)})
                </span>
              )}
            </p>
            {outstandingAdvance > 0 && (
              <p className="mt-1">
                Advance held:{" "}
                <span className="font-medium tabular-nums">
                  {formatMinor(outstandingAdvance)}
                </span>
              </p>
            )}
            <p className="mt-1">
              Net to pay:{" "}
              <span className="font-medium tabular-nums">
                {formatMinor(suggestedNet)}
              </span>
            </p>
            {settlePreviewActive && payablePreview > 0 && (
              <p className="mt-2 text-muted-foreground">
                {cashPreview > 0 || advancePreview > 0 ? (
                  <>
                    Pay{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMinor(cashPreview)}
                    </span>{" "}
                    cash
                    {advancePreview > 0 && (
                      <>
                        {" · use "}
                        <span className="font-medium tabular-nums text-foreground">
                          {formatMinor(advancePreview)}
                        </span>{" "}
                        advance
                      </>
                    )}
                    {" · clear "}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMinor(payablePreview)}
                    </span>{" "}
                    salary
                  </>
                ) : null}
              </p>
            )}
            {excessPreview > 0 && (
              <p className="mt-1 text-muted-foreground">
                Extra becomes advance:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMinor(excessPreview)}
                </span>
              </p>
            )}
            {status.period_paid_minor > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Already paid this month: {formatMinor(status.period_paid_minor)}
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
            {confirming
              ? "Posting…"
              : cashPreview > 0
                ? "Post salary payment"
                : "Record"}
          </Button>
        </div>
      </form>
  );

  if (embedded) {
    return (
      <>
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{dialogTitle}</h3>
          {form}
        </div>
        <DuplicateRecordDialog />
      </>
    );
  }

  return (
    <>
    <Dialog
      open={dialogOpen}
      title={dialogTitle}
      onClose={onClose}
      className="max-w-lg"
    >
      {form}
    </Dialog>
    <DuplicateRecordDialog />
    </>
  );
}
