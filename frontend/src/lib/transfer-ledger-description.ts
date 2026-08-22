/** Account-transfer description composers — mirrors backend transfer_display_description. */

const BARE_NOTE_DEFAULTS = new Set(["account transfer"]);

export function formatTransferAccountLabel(
  name: string,
  accountKind: string,
): string {
  return `${name} (${accountKind})`;
}

export function noteFromPayload(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || BARE_NOTE_DEFAULTS.has(text.toLowerCase())) return null;
  return text;
}

export function appendOwnerNote(
  body: string,
  note: string | null | undefined,
): string {
  if (note) return `${body} — ${note}`;
  return body;
}

export function buildTransferDisplayDescription(args: {
  fromLabel: string;
  toLabel: string;
  note?: string | null;
}): string {
  const body = `Transfer · ${args.fromLabel} → ${args.toLabel}`;
  return appendOwnerNote(body, args.note ?? null);
}
