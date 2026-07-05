/** Invoice kind labels and review-confidence helpers (IC-C). */

export type ClassificationConfidence = "high" | "medium" | "low";

/** Known platform commission seller VKNs (Getir / Yemeksepeti). */
export const KNOWN_DELIVERY_COMMISSION_SELLER_VKNS = new Set([
  "3940482658",
  "9470457468",
]);

export function isKnownCommissionSellerVkn(
  vkn: string | null | undefined,
): boolean {
  const normalized = (vkn ?? "").trim();
  return (
    normalized.length > 0 &&
    KNOWN_DELIVERY_COMMISSION_SELLER_VKNS.has(normalized)
  );
}

export function needsDeliveryPlatformLink(draft: {
  invoice_kind: string;
  delivery_platform_id: string | null;
  supplier_vkn?: string | null;
}): boolean {
  if (draft.delivery_platform_id) {
    return false;
  }
  if (draft.invoice_kind === "delivery_commission") {
    return true;
  }
  return isKnownCommissionSellerVkn(draft.supplier_vkn);
}

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
