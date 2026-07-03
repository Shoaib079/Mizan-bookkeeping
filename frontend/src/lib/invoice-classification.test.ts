import { describe, expect, it } from "vitest";

import {
  acceptSuggestionLabel,
  confirmDraftLabel,
  invoiceKindLabel,
  needsClassificationReview,
} from "@/lib/invoice-classification";

describe("invoiceKindLabel", () => {
  it("labels supplier and commission kinds", () => {
    expect(invoiceKindLabel("supplier_credit")).toBe("İade");
    expect(invoiceKindLabel("supplier")).toBe("Supplier expense");
    expect(invoiceKindLabel("delivery_commission")).toBe("Delivery commission");
  });
});

describe("needsClassificationReview", () => {
  it("flags medium and low confidence", () => {
    expect(needsClassificationReview("medium")).toBe(true);
    expect(needsClassificationReview("low")).toBe(true);
  });

  it("allows high confidence without type picker", () => {
    expect(needsClassificationReview("high")).toBe(false);
    expect(needsClassificationReview(null)).toBe(false);
  });
});

describe("action labels", () => {
  it("uses kind-specific confirm and accept copy", () => {
    expect(confirmDraftLabel("supplier")).toBe("Confirm supplier expense");
    expect(confirmDraftLabel("delivery_commission")).toBe(
      "Confirm delivery commission",
    );
    expect(acceptSuggestionLabel("supplier")).toBe("Accept as supplier expense");
  });
});
