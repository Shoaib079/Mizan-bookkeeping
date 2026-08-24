/** Client-side validation messages for staff salary payment submit. */

export function staffSalarySubmitError(args: {
  extraDaysInvalid: boolean;
  hasSalary: boolean;
  year: number;
  month: number;
  isStatement: boolean;
  cash: number;
  isTry: boolean;
  fundingMode: "cash" | "partner";
  paymentGlAccountId: string;
  partnerId: string;
  fxWalletId: string;
  payCurrency: string;
  hasExtra: boolean;
  extraDayRateMinor: number | null;
}): string | null {
  if (args.extraDaysInvalid) {
    return "Extra days must be a whole number from 1 to 31.";
  }
  if (!args.hasSalary) return "Enter salary for this month.";
  if (!Number.isFinite(args.year) || args.year < 2000) {
    return "Enter a valid salary year.";
  }
  if (!Number.isFinite(args.month) || args.month < 1 || args.month > 12) {
    return "Choose a salary month.";
  }
  if (
    !args.isStatement &&
    args.cash > 0 &&
    args.isTry &&
    args.fundingMode === "cash" &&
    !args.paymentGlAccountId
  ) {
    return "Choose a cash or bank account.";
  }
  if (
    !args.isStatement &&
    args.cash > 0 &&
    args.isTry &&
    args.fundingMode === "partner" &&
    !args.partnerId
  ) {
    return "Choose the partner who paid.";
  }
  if (!args.isStatement && args.cash > 0 && !args.isTry && !args.fxWalletId) {
    return `No ${args.payCurrency} wallet found.`;
  }
  if (
    args.hasExtra &&
    (args.extraDayRateMinor === null || args.extraDayRateMinor <= 0)
  ) {
    return "Enter a valid per-day pay for extra days.";
  }
  return null;
}
