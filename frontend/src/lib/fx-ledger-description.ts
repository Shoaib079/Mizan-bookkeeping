/** FX ledger description composers — mirrors backend fx/ledger_display_description. */

import { formatTry } from "@/lib/money";

const BARE_PREFIXES = ["buy ", "convert ", "fx expense (", "fx purchase"];

function isBareNote(text: string): boolean {
  const folded = text.trim().toLowerCase();
  if (!folded) return true;
  return BARE_PREFIXES.some((prefix) => folded.startsWith(prefix));
}

export function noteFromPayload(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || isBareNote(text)) return null;
  return text;
}

export function appendOwnerNote(body: string, note: string | null | undefined): string {
  if (note) return `${body} — ${note}`;
  return body;
}

export function formatNativeAmount(nativeQuantity: number, currency: string): string {
  const abs = Math.abs(nativeQuantity);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${whole}.${frac.toString().padStart(2, "0")} ${currency}`;
}

function tryEmbed(amountKurus: number): string {
  return formatTry(amountKurus).replace(/ ₺$/, "");
}

export function formatPurchaseRate(
  tryCostKurus: number,
  nativeQuantity: number,
): string {
  if (nativeQuantity > 0) {
    const rate = Math.floor((tryCostKurus * 100) / nativeQuantity);
    return tryEmbed(rate);
  }
  return tryEmbed(tryCostKurus);
}

export function buildFxPurchaseDescription(args: {
  nativeQuantity: number;
  currency: string;
  tryCostKurus: number;
  cashAccountName: string;
  note?: string | null;
}): string {
  const native = formatNativeAmount(args.nativeQuantity, args.currency);
  const rate = formatPurchaseRate(args.tryCostKurus, args.nativeQuantity);
  const body = `FX purchase · ${native} @ ${rate} ₺ · from ${args.cashAccountName}`;
  return appendOwnerNote(body, args.note ?? null);
}

export function buildFxConversionDescription(args: {
  nativeQuantity: number;
  currency: string;
  tryReceivedKurus: number;
  note?: string | null;
}): string {
  const native = formatNativeAmount(args.nativeQuantity, args.currency);
  const received = tryEmbed(args.tryReceivedKurus);
  const body = `FX conversion · ${native} → ${received} ₺`;
  return appendOwnerNote(body, args.note ?? null);
}

export function buildFxSpendDescription(args: {
  nativeQuantity: number;
  currency: string;
  expenseDescription?: string | null;
  note?: string | null;
}): string {
  const native = formatNativeAmount(args.nativeQuantity, args.currency);
  let expense = (args.expenseDescription ?? "").trim() || null;
  if (expense && isBareNote(expense)) expense = null;
  const body = expense
    ? `FX spend · ${native} · ${expense}`
    : `FX spend · ${native}`;
  return appendOwnerNote(body, args.note ?? null);
}
