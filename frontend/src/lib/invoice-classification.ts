/** Invoice kind labels and review-confidence helpers (IC-C). */

export type InvoiceKind = "supplier" | "delivery_commission";

export type ClassificationConfidence = "high" | "medium" | "low";

export function invoiceKindLabel(kind: string): string {
  return kind === "delivery_commission"
    ? "Delivery commission"
    : "Supplier expense";
}

export function confirmDraftLabel(kind: string): string {
  return kind === "delivery_commission"
    ? "Confirm delivery commission"
    : "Confirm supplier expense";
}

export function acceptSuggestionLabel(kind: string): string {
  return kind === "delivery_commission"
    ? "Accept as delivery commission"
    : "Accept as supplier expense";
}

/** Type picker only when intake confidence is not HIGH. */
export function needsClassificationReview(
  confidence: ClassificationConfidence | string | null | undefined,
): boolean {
  return confidence === "medium" || confidence === "low";
}
