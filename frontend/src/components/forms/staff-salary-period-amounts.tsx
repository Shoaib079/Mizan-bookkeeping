"use client";

/** Period / salary / cash / extra-days fields for StaffSalaryPaymentDialog. */

import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { formatTry } from "@/lib/money";

export const STAFF_SALARY_MONTHS = [
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
  isTry: boolean;
  payCurrency: string;
  periodYear: string;
  setPeriodYear: (value: string) => void;
  periodMonth: string;
  setPeriodMonth: (value: string) => void;
  salaryText: string;
  setSalaryText: (value: string) => void;
  cashText: string;
  setCashText: (value: string) => void;
  lockCashAmount: boolean;
  suggestedNet: number;
  extraDaysText: string;
  setExtraDaysText: (value: string) => void;
  extraDayRateText: string;
  setExtraDayRateText: (value: string) => void;
  extraDaysInvalid: boolean;
  extraDaysTotalMinor: number | null;
};

export function StaffSalaryPeriodAmounts({
  isTry,
  payCurrency,
  periodYear,
  setPeriodYear,
  periodMonth,
  setPeriodMonth,
  salaryText,
  setSalaryText,
  cashText,
  setCashText,
  lockCashAmount,
  suggestedNet,
  extraDaysText,
  setExtraDaysText,
  extraDayRateText,
  setExtraDayRateText,
  extraDaysInvalid,
  extraDaysTotalMinor,
}: Props) {
  return (
    <>
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
          <Label htmlFor="pay-period-month">
            Salary month (which month you are paying for)
          </Label>
          <Select
            id="pay-period-month"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            required
          >
            {STAFF_SALARY_MONTHS.map((m) => (
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
        <Label htmlFor="pay-salary-amount">
          Salary for this month ({payCurrency})
        </Label>
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
    </>
  );
}
