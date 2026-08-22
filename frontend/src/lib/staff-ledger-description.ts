/** Staff ledger description composers — mirrors backend staff/ledger_display_description. */

const MONTH_ABBREV = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const BARE_NOTE_DEFAULTS = new Set([
  "salary payment",
  "salary accrual",
  "salary advance",
  "advance returned",
]);

export function periodLabel(
  year: number | null | undefined,
  month: number | null | undefined,
): string | null {
  if (year == null || month == null || month < 1 || month > 12) return null;
  return `${MONTH_ABBREV[month]} ${year}`;
}

export function appendOwnerNote(body: string, note: string | null | undefined): string {
  if (note) return `${body} — ${note}`;
  return body;
}

export function noteFromPayload(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || BARE_NOTE_DEFAULTS.has(text.toLowerCase())) return null;
  return text;
}

export function buildStaffLedgerDisplayDescription(args: {
  movementType: string;
  employeeName: string;
  periodYear?: number | null;
  periodMonth?: number | null;
  note?: string | null;
}): string {
  const period = periodLabel(args.periodYear, args.periodMonth);
  let body: string;
  if (args.movementType === "salary_accrued") {
    body = period
      ? `Salary ${period} · ${args.employeeName}`
      : `Salary · ${args.employeeName}`;
  } else if (args.movementType === "salary_payment") {
    body = `Salary payment · ${args.employeeName}`;
    if (period) body = `${body} · ${period}`;
  } else if (args.movementType === "advance_paid") {
    body = `Advance · ${args.employeeName}`;
  } else if (args.movementType === "advance_returned") {
    body = `Advance returned · ${args.employeeName}`;
  } else {
    body = `${args.movementType} · ${args.employeeName}`;
  }
  return appendOwnerNote(body, args.note ?? null);
}
