/** Invoice kind labels and review-confidence helpers (IC-C). */

export type InvoiceKind = "supplier" | "supplier_credit" | "delivery_commission";

export type ClassificationConfidence = "high" | "medium" | "low";

export function invoiceKindLabel(kind: string): string {
  if (kind === "delivery_commission") {
    return "Delivery commission";
  }
  if (kind === "supplier_credit") {
    return "İade";
  }
  return "Supplier expense";
}

export function confirmDraftLabel(kind: string): string {
  if (kind === "delivery_commission") {
    return "Confirm delivery commission";
  }
  if (kind === "supplier_credit") {
    return "Confirm supplier credit note";
  }
  return "Confirm supplier expense";
}

export function acceptSuggestionLabel(kind: string): string {
  if (kind === "delivery_commission") {
    return "Accept as delivery commission";
  }
  if (kind === "supplier_credit") {
    return "Accept as supplier credit note";
  }
  return "Accept as supplier expense";
}

/** Type picker only when intake confidence is not HIGH. */
export function needsClassificationReview(
  confidence: ClassificationConfidence | string | null | undefined,
): boolean {
  return confidence === "medium" || confidence === "low";
}
