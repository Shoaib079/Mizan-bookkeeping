/** Partner ledger description composers — mirrors backend partners/ledger_display_description. */

import { partnerMovementLabels } from "@/lib/subledger-labels";

const BARE_NOTE_DEFAULTS = new Set([
  "partner cash payment",
  "partner profit paid",
  "partner returned cash",
  "partner profit allocation",
  "salary payment",
  "manual expense",
  "opening balances",
  "opening balance",
]);

export function noteFromPayload(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || BARE_NOTE_DEFAULTS.has(text.toLowerCase())) return null;
  return text;
}

export function appendOwnerNote(body: string, note: string | null | undefined): string {
  if (note) return `${body} — ${note}`;
  return body;
}

export function movementLabel(movementType: string): string {
  return (
    partnerMovementLabels[movementType] ??
    movementType.replace(/_/g, " ")
  );
}

export function buildPartnerLedgerDisplayDescription(args: {
  movementType: string;
  partnerName: string;
  subjectName?: string | null;
  note?: string | null;
}): string {
  const label = movementLabel(args.movementType);
  const subject = (args.subjectName ?? "").trim() || null;
  const body = subject
    ? `${label} · ${args.partnerName} · ${subject}`
    : `${label} · ${args.partnerName}`;
  return appendOwnerNote(body, args.note ?? null);
}
