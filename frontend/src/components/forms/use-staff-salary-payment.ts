"use client";

/** State + load/submit for StaffSalaryPaymentDialog (file-size split). */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type SalaryFundingMode } from "@/components/forms/staff-salary-funding-fields";
import { apiFetch } from "@/lib/api";
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
  formatCashPrefill,
  isValidStaffSalaryEmployee,
  netToPayMinor,
  parseStrictExtraDays,
  type SalaryPeriodStatus,
} from "@/lib/staff-salary";
import {
  staffSalaryContextCashText,
  staffSalaryInitialCashText,
  staffSalaryOpenPeriod,
  staffSalaryPeriodFromIso,
} from "@/lib/staff-salary-payment-open";
import {
  postStaffSalaryPayment,
  type PeriodPayload,
} from "@/lib/staff-salary-payment-submit";
import { staffSalarySettlePreview } from "@/lib/staff-salary-settle-preview";
import { staffSalarySubmitError } from "@/lib/staff-salary-submit-validate";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useDuplicateRecordSubmit } from "@/lib/use-duplicate-record-submit";
import { useToast } from "@/lib/toast";

export type StaffSalaryPaymentArgs = {
  open: boolean;
  onClose: () => void;
  entityId: string;
  employeeId: string;
  employeeName: string;
  payCurrency: string;
  source?: "staff" | "statement";
  paymentDate?: string;
  hidePaymentDate?: boolean;
  defaultCashMinor?: number;
  lockCashAmount?: boolean;
  onConfirm?: (payload: PeriodPayload) => void | Promise<void>;
  onSaved?: () => void;
  closeOnSuccess?: boolean;
  confirmingProp?: boolean;
};

export function useStaffSalaryPayment(args: StaffSalaryPaymentArgs) {
  const {
    open, onClose, entityId, employeeId, employeeName, payCurrency,
    source = "staff", paymentDate, hidePaymentDate = false, defaultCashMinor,
    lockCashAmount = false, onConfirm, onSaved, closeOnSuccess = true,
    confirmingProp = false,
  } = args;

  const { actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithDuplicateGuard, DuplicateRecordDialog } =
    useDuplicateRecordSubmit();
  const isTry = payCurrency === "TRY";
  const isStatement = source === "statement";

  const [dateText, setDateText] = useState("");
  const [description, setDescription] = useState("");
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

  const salaryMinor = useMemo(
    () => (isTry ? parseTryToKurus(salaryText) : parseFxNative(salaryText)),
    [isTry, salaryText],
  );
  const cashMinor = useMemo(() => {
    if (!cashText.trim()) return 0;
    return isTry ? parseTryToKurus(cashText) : parseFxNative(cashText);
  }, [cashText, isTry]);
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
      const prefillKey = `${employeeId}:${year}:${month}`;
      if (
        defaultCashMinor == null &&
        !lockCashAmount &&
        cashPrefillRef.current !== prefillKey
      ) {
        cashPrefillRef.current = prefillKey;
        const owed = data.total_owed_minor ?? data.period_remaining_minor;
        setCashText(
          formatCashPrefill(
            netToPayMinor(owed, data.outstanding_advance_minor),
            isTry,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load period");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [
    defaultCashMinor, employeeId, entityId, isTry, lockCashAmount, open,
    periodMonth, periodYear, salaryMinor, salaryText,
  ]);

  useEffect(() => {
    if (!open) return;
    submitIdempotency.resetSubmit();
    const opened = staffSalaryOpenPeriod({ hidePaymentDate, paymentDate });
    if (opened) {
      setDateText(opened.dateText);
      setPeriodYear(opened.periodYear);
      setPeriodMonth(opened.periodMonth);
    }
    setDescription("");
    setFundingMode("cash");
    setPartnerId("");
    setSalaryText("");
    setCashText(staffSalaryInitialCashText(defaultCashMinor, isTry));
    setExtraDaysText("");
    setExtraDayRateText("");
    setTryCostText("");
    setError(null);
    void loadAccounts().catch(() => undefined);
  }, [
    open, defaultCashMinor, hidePaymentDate, isTry, loadAccounts, paymentDate,
    submitIdempotency,
  ]);

  useEffect(() => {
    if (!open || hidePaymentDate || !dateText) return;
    const iso = parseTrDate(dateText);
    if (!iso) return;
    const period = staffSalaryPeriodFromIso(iso);
    setPeriodYear(period.periodYear);
    setPeriodMonth(period.periodMonth);
  }, [dateText, hidePaymentDate, open]);

  useEffect(() => {
    if (!open || !hidePaymentDate || !paymentDate) return;
    const period = staffSalaryPeriodFromIso(paymentDate);
    setPeriodYear(period.periodYear);
    setPeriodMonth(period.periodMonth);
  }, [hidePaymentDate, open, paymentDate]);

  useEffect(() => {
    if (!open) {
      loadedContextRef.current = "";
      return;
    }
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    if (
      !Number.isFinite(year) || year < 2000 ||
      !Number.isFinite(month) || month < 1 || month > 12
    ) {
      return;
    }
    const contextKey = `${employeeId}:${payCurrency}:${year}:${month}`;
    if (loadedContextRef.current === contextKey) return;
    loadedContextRef.current = contextKey;
    cashPrefillRef.current = "";
    setSalaryText("");
    setCashText(staffSalaryContextCashText(defaultCashMinor, isTry));
    setExtraDaysText("");
    setExtraDayRateText("");
    setStatus(null);
    setTryCostText("");
    setError(null);
  }, [employeeId, payCurrency, periodYear, periodMonth, open, defaultCashMinor, isTry]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadStatus(), 250);
    return () => window.clearTimeout(timer);
  }, [loadStatus, open]);

  const settle = staffSalarySettlePreview({ status, extraDaysTotalMinor, cashMinor });

  function formatMinor(minor: number): string {
    if (isTry) return formatTry(minor);
    return `${(minor / 100).toFixed(2)} ${payCurrency}`;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const year = Number.parseInt(periodYear, 10);
    const month = Number.parseInt(periodMonth, 10);
    const cash = cashMinor ?? 0;
    const hasSalary = salaryMinor != null && salaryMinor > 0;
    const hasExtra =
      isTry && extraDays > 0 &&
      extraDayRateMinor !== null && extraDayRateMinor > 0;
    const validationError = staffSalarySubmitError({
      extraDaysInvalid, hasSalary, year, month, isStatement, cash, isTry,
      fundingMode, paymentGlAccountId, partnerId, fxWalletId, payCurrency,
      hasExtra, extraDayRateMinor,
    });
    if (validationError) {
      setError(validationError);
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
    try {
      const result = await postStaffSalaryPayment({
        entityId, employeeId, actorId, description,
        dateText: resolvedDateText, isTry, payCurrency, fundingMode, partnerId,
        paymentGlAccountId, fxWalletId, tryCostText,
        payload: {
          period_year: year,
          period_month: month,
          period_salary_minor: salaryMinor!,
          amount_minor: cash,
          ...(hasExtra
            ? { extra_days: extraDays, per_day_minor: extraDayRateMinor! }
            : {}),
        },
        beginSubmit: () => submitIdempotency.beginSubmit(),
        submitWithDuplicateGuard,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      submitIdempotency.completeSubmit();
      toast(cash > 0 ? "Payment recorded" : "Salary recorded");
      onSaved?.();
      setCashText("");
      setExtraDaysText("");
      setExtraDayRateText("");
      if (!closeOnSuccess) void loadStatus();
      else onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return {
    isTry, isStatement, dialogOpen, dialogTitle, confirming,
    dateText, setDateText, description, setDescription,
    tryAccounts, paymentGlAccountId, setPaymentGlAccountId,
    fundingMode, setFundingMode, partners, partnerId, setPartnerId,
    fxAccounts, fxWalletId, setFxWalletId, tryCostText, setTryCostText,
    periodYear, setPeriodYear, periodMonth, setPeriodMonth,
    salaryText, setSalaryText, cashText, setCashText,
    extraDaysText, setExtraDaysText, extraDayRateText, setExtraDayRateText,
    extraDaysInvalid, extraDaysTotalMinor, status, loading, error,
    lockCashAmount, formatMinor, handleSubmit, DuplicateRecordDialog,
    ...settle,
  };
}
