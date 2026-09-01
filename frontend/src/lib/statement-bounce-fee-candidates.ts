/** Fee/refund detection and selection for payment bounce (mirrors backend). */

import type { BankStatementLine, StatementLineClassification } from "@/lib/banking-types";
import { formatTry } from "@/lib/money";

/** 1.000 ₺ — fees and refunds above this are usually payments, not charges. */
export const BOUNCE_FEE_SMALL_KURUS = 100_000;
/** 50 ₺ — tiny lines are almost always bank fees or fee refunds. */
export const BOUNCE_FEE_TINY_KURUS = 5_000;

export type FeeCandidateType = "bank_fee" | "pos_commission" | "refund" | "fee";

export type FeeCandidate = {
  id: string;
  amountKurus: number;
  description: string;
  transactionDate: string;
  status: BankStatementLine["status"];
  classification: BankStatementLine["classification"];
  isRefund: boolean;
  type: FeeCandidateType;
};

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

const FEE_CLASSIFICATIONS = new Set<StatementLineClassification>([
  "bank_fee",
  "pos_commission",
]);

const FEE_TYPE_LABELS: Record<FeeCandidateType, string> = {
  bank_fee: "Bank fee",
  pos_commission: "Card commission",
  refund: "Fee refund",
  fee: "Fee",
};

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
  if (amount <= BOUNCE_FEE_SMALL_KURUS && /\b(?:fee|charge)\b/i.test(description)) {
    return true;
  }

  if (normalizeFeeText(description).includes("iade")) return true;

  return false;
}

export function isUnpostedBounceFeeLine(line: BankStatementLine): boolean {
  if (line.status === "posted" || line.status === "linked") return false;
  if (line.journal_entry_id != null) return false;
  if (line.classification === "payment_bounced") return false;
  if (line.bounce_pair_id != null) return false;
  return true;
}

export function getFeeType(line: BankStatementLine): FeeCandidateType {
  if (line.classification === "bank_fee") return "bank_fee";
  if (line.classification === "pos_commission") return "pos_commission";
  if (
    isBankFeeRefundDescription(line.description) ||
    (line.amount_kurus > 0 && normalizeFeeText(line.description).includes("iade"))
  ) {
    return "refund";
  }
  if (isPosCommissionDescription(line.description)) return "pos_commission";
  return "fee";
}

export function getBounceFeeCandidates(
  lines: BankStatementLine[],
  outflowId: string,
  returnId: string,
): FeeCandidate[] {
  return lines
    .filter(
      (line) =>
        line.id !== outflowId &&
        line.id !== returnId &&
        isUnpostedBounceFeeLine(line) &&
        isBounceFeeCandidateLine(line),
    )
    .map((line) => {
      const type = getFeeType(line);
      return {
        id: line.id,
        amountKurus: line.amount_kurus,
        description: line.description,
        transactionDate: line.transaction_date,
        status: line.status,
        classification: line.classification,
        isRefund: type === "refund",
        type,
      };
    });
}

export function formatFeeLabel(fee: FeeCandidate): string {
  return FEE_TYPE_LABELS[fee.type];
}

export function formatFeeCandidateRow(fee: FeeCandidate): string {
  const sign = fee.amountKurus > 0 ? "+" : "";
  return `${sign}${formatTry(fee.amountKurus)} · ${fee.description} (${formatFeeLabel(fee)})`;
}

export function sumFeeCandidateKurus(fees: FeeCandidate[]): number {
  return fees.reduce((sum, fee) => sum + fee.amountKurus, 0);
}

export function resolveBounceNetFeeKurus(
  manualNetFeeKurus: number | null,
  selectedFees: FeeCandidate[],
): number {
  if (manualNetFeeKurus !== null) return manualNetFeeKurus;
  return sumFeeCandidateKurus(selectedFees);
}

export function toggleFeeSelection(selectedIds: string[], feeId: string): string[] {
  return selectedIds.includes(feeId)
    ? selectedIds.filter((id) => id !== feeId)
    : [...selectedIds, feeId];
}

/** Selecting fee lines clears manual entry (caller clears manual string). */
export function feeSelectionClearsManual(manualFeeAmount: string): boolean {
  return manualFeeAmount.trim().length > 0;
}

/** Manual entry clears fee line selections (caller clears selected ids). */
export function manualFeeClearsSelection(selectedFeeIds: string[]): boolean {
  return selectedFeeIds.length > 0;
}
