import { describe, expect, it } from "vitest";

import {
  invoiceReviewListPath,
  INVOICE_REVIEW_TABS,
  type InvoiceReviewTab,
} from "@/lib/invoice-draft-list";

describe("invoiceReviewListPath", () => {
  const from = "2026-03-01";
  const to = "2026-03-31";

  it("includes from/to for every tab", () => {
    for (const tab of INVOICE_REVIEW_TABS) {
      const path = invoiceReviewListPath(tab.id, from, to);
      expect(path).toContain(`from=${from}`);
      expect(path).toContain(`to=${to}`);
    }
  });

  it("scopes posted tab to posted status", () => {
    expect(invoiceReviewListPath("posted", from, to)).toContain("status=posted");
  });

  it("scopes ready tab to confirmed status", () => {
    expect(invoiceReviewListPath("ready", from, to)).toContain(
      "status=confirmed",
    );
  });
});

describe("InvoiceReviewTab", () => {
  it("accepts the four filter ids", () => {
    const tabs: InvoiceReviewTab[] = ["pending", "ready", "posted", "all"];
    expect(tabs).toHaveLength(4);
  });
});
