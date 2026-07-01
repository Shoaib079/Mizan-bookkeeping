/** Bank statement line classification — shared labels and amount-aware filtering. */

import type { StatementLineClassification } from "@/lib/banking-types";

export type ClassificationTarget =
  | "supplier"
  | "customer"
  | "transfer"
  | "credit_card"
  | "expense"
  | "delivery_platform";

export type ClassificationOption = {
  value: StatementLineClassification;
  label: string;
  hint: string;
  /** Positive bank inflow, negative outflow, or both. */
  direction: "inflow" | "outflow" | "both";
  target: ClassificationTarget | null;
};

/** All classifications the backend supports (excluding unclassified). */
export const STATEMENT_CLASSIFICATION_OPTIONS: ClassificationOption[] = [
  {
    value: "delivery_settlement",
    label: "Delivery app payment",
    hint: "Trendyol, Getir, Yemeksepeti, Migros…",
    direction: "inflow",
    target: "delivery_platform",
  },
  {
    value: "pos_settlement",
    label: "POS / card settlement",
    hint: "Card acquirer deposit to bank",
    direction: "inflow",
    target: null,
  },
  {
    value: "customer_payment",
    label: "Customer payment",
    hint: "Receivable collected to bank",
    direction: "inflow",
    target: "customer",
  },
  {
    value: "transfer",
    label: "Transfer",
    hint: "Move between your accounts",
    direction: "both",
    target: "transfer",
  },
  {
    value: "supplier_payment",
    label: "Supplier payment",
    hint: "Pay a supplier from bank",
    direction: "outflow",
    target: "supplier",
  },
  {
    value: "credit_card_payment",
    label: "Credit card payment",
    hint: "Pay card liability from bank",
    direction: "outflow",
    target: "credit_card",
  },
  {
    value: "rent_utility",
    label: "Rent / utility",
    hint: "Expense posted from bank",
    direction: "outflow",
    target: "expense",
  },
  {
    value: "bank_fee",
    label: "Bank charges",
    hint: "Fees, EFT charges, commissions",
    direction: "outflow",
    target: null,
  },
  {
    value: "unknown",
    label: "Unknown (skip)",
    hint: "Leave unposted — review later",
    direction: "both",
    target: null,
  },
];

export function classificationOptionsForAmount(
  amountKurus: number,
): ClassificationOption[] {
  if (amountKurus > 0) {
    return STATEMENT_CLASSIFICATION_OPTIONS.filter(
      (opt) => opt.direction === "inflow" || opt.direction === "both",
    );
  }
  if (amountKurus < 0) {
    return STATEMENT_CLASSIFICATION_OPTIONS.filter(
      (opt) => opt.direction === "outflow" || opt.direction === "both",
    );
  }
  return STATEMENT_CLASSIFICATION_OPTIONS;
}

export function classificationOption(
  value: StatementLineClassification,
): ClassificationOption | undefined {
  return STATEMENT_CLASSIFICATION_OPTIONS.find((opt) => opt.value === value);
}

export function classificationLabel(value: string): string {
  return (
    classificationOption(value as StatementLineClassification)?.label ??
    value.replace(/_/g, " ")
  );
}

const DELIVERY_HINT =
  /TRENDYOL|GETIR|YEMEK|MIGROS|TYG\s|DELIVERY|MARKETPLACE|YEMEKSEPETI/i;
const POS_HINT = /POS|KART|CARD|ÖKC|BKM|SANAL|VISA|MASTERCARD/i;
const BANK_FEE_HINT = /KOMISYON|BANKA|MASRAF|ÜCRET|EFT|HAVALE|BSMV/i;

/** Best-effort default when a line is first shown. */
export function suggestClassificationForLine(line: {
  amount_kurus: number;
  description: string;
}): StatementLineClassification {
  const text = line.description;
  if (line.amount_kurus > 0) {
    if (DELIVERY_HINT.test(text)) return "delivery_settlement";
    if (POS_HINT.test(text)) return "pos_settlement";
    return "customer_payment";
  }
  if (line.amount_kurus < 0) {
    if (BANK_FEE_HINT.test(text)) return "bank_fee";
    return "supplier_payment";
  }
  return "unknown";
}

/** Match delivery platform name from statement description (e.g. TRENDYOL → Trendyol). */
export function suggestDeliveryPlatformId(
  description: string,
  platforms: { id: string; name: string }[],
): string | null {
  const upper = description.toUpperCase();
  for (const platform of platforms) {
    const name = platform.name.toUpperCase();
    if (name.length >= 3 && upper.includes(name)) {
      return platform.id;
    }
  }
  if (/TRENDYOL|TYG/.test(upper)) {
    const trendyol = platforms.find((p) =>
      p.name.toUpperCase().includes("TRENDYOL"),
    );
    if (trendyol) return trendyol.id;
  }
  if (/GETIR/.test(upper)) {
    const getir = platforms.find((p) => p.name.toUpperCase().includes("GETIR"));
    if (getir) return getir.id;
  }
  if (/YEMEK/.test(upper)) {
    const ys = platforms.find((p) =>
      /YEMEK|SEPET/.test(p.name.toUpperCase()),
    );
    if (ys) return ys.id;
  }
  return platforms[0]?.id ?? null;
}

export function truncateStatementText(text: string, max = 72): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
