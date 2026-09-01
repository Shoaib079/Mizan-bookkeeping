/** Fee/refund detection for payment bounce net-fee selection (mirrors backend). */

import type { BankStatementLine, StatementLineClassification } from "@/lib/banking-types";

/** 1.000 ₺ — fees and refunds above this are usually payments, not charges. */
export const BOUNCE_FEE_SMALL_KURUS = 100_000;
/** 50 ₺ — tiny lines are almost always bank fees or fee refunds. */
export const BOUNCE_FEE_TINY_KURUS = 5_000;

const TURKISH_FOLD: Record<string, string> = {
  ü: "u",
  ö: "o",
  ş: "s",
  ç: "c",
  ğ: "g",
  ı: "i",
  Ü: "u",
  Ö: "o",
  Ş: "s",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  I: "i",
};

function normalizeFeeText(description: string): string {
  return description
    .toLowerCase()
    .replace(/[üöşçğıÜÖŞÇĞİI]/g, (ch) => TURKISH_FOLD[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}

const FEE_PATTERNS = [
  /\bbsmv\b/,
  /\b(?:ucret(?:i)?|masraf(?:i)?|aidat(?:i)?|komisyon(?:u)?)\b/,
  /\bhesap\s+isletim\b/,
  /\bisletim\s+ucret/,
  /\bperiyodik\s+bakim\b/,
  /\bbakim\s+ucret/,
  /\b(?:ekstre|islem)\s+(?:ucret|masraf)/,
  /\b(?:ucret|masraf)\s+(?:ekstre|islem)/,
  /\b(?:havale|eft|fast)\s+(?:ucret|masraf)/,
  /\b(?:ucret|masraf)\s+(?:havale|eft|fast)/,
  /\bkart\s+aidat\b/,
];

const POS_COMMISSION_PATTERNS = [
  /\bpos\s+(?:komisyon|ucret|masraf)/,
  /\b(?:komisyon|ucret|masraf)\s+pos\b/,
  /\bkart\s+(?:komisyon|ucret|masraf)/,
  /\b(?:komisyon|ucret|masraf)\s+kart\b/,
  /\bbkm\s+komisyon/,
  /\bkomisyon\s+bkm\b/,
  /\bokc\s+komisyon/,
  /\bkomisyon\s+okc\b/,
  /\bpos\s+islem/,
  /\bsanal\s+pos\s+komisyon/,
];

const FEE_REFUND_PATTERNS = [
  /\b(?:ucret|masraf|komisyon)\s+iades/,
  /\bfee\s+refund/,
  /\b(?:fast|havale|eft)\s+.*\biades/,
  /\biades.*\b(?:ucret|masraf|komisyon)\b/,
];

const BARE_FEE_TOKENS = new Set(["komisyon", "komisyonu", "masraf", "masrafi", "ucret", "ucreti"]);

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isPosCommissionDescription(description: string): boolean {
  const normalized = normalizeFeeText(description);
  return normalized.length > 0 && matchesAny(normalized, POS_COMMISSION_PATTERNS);
}

export function isBankFeeDescription(description: string): boolean {
  if (isPosCommissionDescription(description)) return false;
  const normalized = normalizeFeeText(description);
  if (!normalized || !matchesAny(normalized, FEE_PATTERNS)) return false;
  const tokens = normalized.split(/\s+/).filter((token) => !/^\d+[.,]\d{2}$/.test(token));
  if (tokens.length === 1 && BARE_FEE_TOKENS.has(tokens[0]!)) return false;
  return true;
}

export function isBankFeeRefundDescription(description: string): boolean {
  const normalized = normalizeFeeText(description);
  return normalized.length > 0 && matchesAny(normalized, FEE_REFUND_PATTERNS);
}

const FEE_CLASSIFICATIONS = new Set<StatementLineClassification>([
  "bank_fee",
  "pos_commission",
]);

export function isBounceFeeCandidateLine(line: BankStatementLine): boolean {
  if (line.amount_kurus === 0) return false;

  const amount = Math.abs(line.amount_kurus);

  if (FEE_CLASSIFICATIONS.has(line.classification)) {
    return amount <= BOUNCE_FEE_SMALL_KURUS;
  }

  if (amount <= BOUNCE_FEE_TINY_KURUS) return true;
  if (amount > BOUNCE_FEE_SMALL_KURUS) return false;

  const { description } = line;
  if (isBankFeeRefundDescription(description)) return true;
  if (isBankFeeDescription(description) || isPosCommissionDescription(description)) return true;
  if (
    amount <= BOUNCE_FEE_SMALL_KURUS &&
    /\b(?:fee|charge)\b/i.test(description)
  ) {
    return true;
  }

  if (normalizeFeeText(description).includes("iade")) return true;

  return false;
}

export type BounceFeeLineKind = "fee" | "refund" | "commission" | "other";

export function bounceFeeLineKind(line: BankStatementLine): BounceFeeLineKind {
  if (line.classification === "pos_commission" || isPosCommissionDescription(line.description)) {
    return "commission";
  }
  if (
    line.amount_kurus > 0 &&
    (isBankFeeRefundDescription(line.description) ||
      normalizeFeeText(line.description).includes("iade"))
  ) {
    return "refund";
  }
  if (line.amount_kurus < 0 || line.classification === "bank_fee" || isBankFeeDescription(line.description)) {
    return "fee";
  }
  return "other";
}

export function formatBounceFeeLineLabel(line: BankStatementLine): string {
  const base = `${line.amount_kurus > 0 ? "+" : ""}${formatAmountInline(line.amount_kurus)} · ${line.description}`;
  switch (bounceFeeLineKind(line)) {
    case "refund":
      return `${base} (Fee refund)`;
    case "commission":
      return `${base} (Card commission)`;
    case "fee":
      return `${base} (Bank fee)`;
    default:
      return base;
  }
}

function formatAmountInline(kurus: number): string {
  const abs = Math.abs(kurus);
  const lira = Math.floor(abs / 100);
  const frac = abs % 100;
  const whole = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${kurus < 0 ? "-" : ""}${whole},${frac.toString().padStart(2, "0")} ₺`;
}
