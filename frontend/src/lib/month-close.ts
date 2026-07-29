/** Month picking and close-state wording for the month close page.
 *
 * Pure helpers — the page reads them, the tests pin them.
 */

import type { MonthCloseReadinessRead, PeriodLockRead } from "@/lib/report-types";

export type MonthOption = {
  /** "2026-06" — what the select carries. */
  value: string;
  year: number;
  month: number;
  label: string;
};

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_TR[month - 1]} ${year}`;
}

export function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthValue(
  value: string,
): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Months available to close, newest first, starting from the month BEFORE the
 * one we're in.
 *
 * The current month is deliberately absent: closing a month you're still
 * trading in would lock the books against today's own sales, and every entry
 * for the rest of the month would demand an unlock reason.
 */
export function closableMonths(today: Date, count = 12): MonthOption[] {
  const options: MonthOption[] = [];
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-indexed today = 1-indexed previous month
  if (month === 0) {
    year -= 1;
    month = 12;
  }
  for (let i = 0; i < count; i += 1) {
    options.push({
      value: monthValue(year, month),
      year,
      month,
      label: monthLabel(year, month),
    });
    month -= 1;
    if (month === 0) {
      year -= 1;
      month = 12;
    }
  }
  return options;
}

export type CloseState =
  | { kind: "open"; canClose: boolean }
  | { kind: "closed"; dirty: boolean; lock: PeriodLockRead };

export function closeState(readiness: MonthCloseReadinessRead): CloseState {
  const lock = readiness.existing_lock;
  if (lock && lock.reopened_at === null) {
    return { kind: "closed", dirty: lock.dirty, lock };
  }
  return { kind: "open", canClose: readiness.can_close };
}

/** The one-line verdict at the top of the page. */
export function readinessSummary(readiness: MonthCloseReadinessRead): string {
  const state = closeState(readiness);
  if (state.kind === "closed") {
    return state.dirty
      ? "Closed — but entries have changed since. Reported figures may no longer match what you exported."
      : "Closed. New entries dated in this month need a reason.";
  }
  if (!state.canClose) {
    const blocker = readiness.checks.find(
      (c) => c.severity === "block" && !c.passed,
    );
    return blocker?.detail || "Not ready to close.";
  }
  if (readiness.warning_count > 0) {
    return `Ready to close — ${readiness.warning_count} thing${
      readiness.warning_count === 1 ? "" : "s"
    } worth a look first.`;
  }
  return "Everything checks out. Ready to close.";
}

export function failedChecks(readiness: MonthCloseReadinessRead) {
  return readiness.checks.filter((c) => !c.passed);
}

export function passedChecks(readiness: MonthCloseReadinessRead) {
  return readiness.checks.filter((c) => c.passed);
}
