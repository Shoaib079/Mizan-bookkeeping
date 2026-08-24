/** Open / period-context reset helpers for staff salary payment form. */

import { todayTrDate } from "@/lib/dates";
import { formatTry, parseTrDate } from "@/lib/money";
import { defaultPeriodFromDate, formatCashPrefill } from "@/lib/staff-salary";

export function staffSalaryInitialCashText(
  defaultCashMinor: number | undefined,
  isTry: boolean,
): string {
  if (defaultCashMinor == null) return "";
  if (isTry) return formatTry(defaultCashMinor).replace(" TL", "");
  return (defaultCashMinor / 100).toFixed(2);
}

export function staffSalaryOpenPeriod(args: {
  hidePaymentDate: boolean;
  paymentDate?: string;
}): { dateText: string; periodYear: string; periodMonth: string } | null {
  if (args.hidePaymentDate) return null;
  const dateText = args.paymentDate
    ? args.paymentDate.split("-").reverse().join(".")
    : todayTrDate();
  const initialIso = args.paymentDate ?? parseTrDate(dateText) ?? "";
  const period = defaultPeriodFromDate(
    initialIso || new Date().toISOString().slice(0, 10),
  );
  return {
    dateText,
    periodYear: String(period.year),
    periodMonth: String(period.month),
  };
}

export function staffSalaryPeriodFromIso(iso: string): {
  periodYear: string;
  periodMonth: string;
} {
  const period = defaultPeriodFromDate(iso);
  return {
    periodYear: String(period.year),
    periodMonth: String(period.month),
  };
}

export function staffSalaryContextCashText(
  defaultCashMinor: number | undefined,
  isTry: boolean,
): string {
  if (defaultCashMinor == null) return "";
  return formatCashPrefill(defaultCashMinor, isTry);
}
