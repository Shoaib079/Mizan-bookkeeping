/** Month picking and close-state wording for the month close page.
 *
 * Pure helpers — the page reads them, the tests pin them.
 */

import type {
  ChangedEntry,
  MonthCloseReadinessRead,
  PeriodLockRead,
  SealedMonthChangesRead,
  YearEndPreviewRead,
} from "@/lib/report-types";

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

/**
 * Years available to close, newest first, starting from last year.
 *
 * The current year is absent for the same reason the current month is: you
 * can't close a year you're still trading in.
 */
export function closableYears(today: Date, count = 5): number[] {
  const start = today.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => start - i);
}

/** The one-line verdict on the year-end card. */
export function yearEndSummary(preview: YearEndPreviewRead): string {
  if (preview.already_closed) {
    return `${preview.year} is closed. Its profit sits in Retained Earnings and the year's accounts start from zero.`;
  }
  if (!preview.december_closed) {
    return `Close December ${preview.year} first — a year can't be sealed over a month that might still change.`;
  }
  if (preview.lines.length === 0) {
    return `Nothing to close for ${preview.year} — no revenue or expense balances.`;
  }
  return preview.net_result_kurus >= 0
    ? `Ready. ${preview.year}'s profit will move into Retained Earnings, where partner distributions draw from.`
    : `Ready. ${preview.year} made a loss, which will reduce Retained Earnings.`;
}

/** What a changed-entry row is telling you, in words. */
export function changeKindLabel(kind: ChangedEntry["change_kind"]): string {
  if (kind === "voided") return "Removed";
  if (kind === "reversal") return "Reversal";
  return "Added";
}

/**
 * One-line account of what moved a sealed month.
 *
 * Deliberately counts additions and removals separately rather than giving a
 * single total: "3 changes" hides whether someone added a forgotten invoice or
 * deleted one, and those are very different conversations.
 */
export function changesSummary(changes: SealedMonthChangesRead): string {
  const added = changes.entries.filter((e) => e.change_kind === "posted").length;
  const removed = changes.entries.filter((e) => e.change_kind === "voided").length;
  if (added === 0 && removed === 0) {
    return "No entries have changed since this month was closed.";
  }
  const parts: string[] = [];
  if (added) parts.push(`${added} ${added === 1 ? "entry" : "entries"} added`);
  if (removed) parts.push(`${removed} removed`);
  return `${parts.join(", ")} since the close.`;
}

export function failedChecks(readiness: MonthCloseReadinessRead) {
  return readiness.checks.filter((c) => !c.passed);
}

export function passedChecks(readiness: MonthCloseReadinessRead) {
  return readiness.checks.filter((c) => c.passed);
}
