import { describe, expect, it } from "vitest";

import {
  invoiceReviewListPath,
  INVOICE_REVIEW_TABS,
  type InvoiceReviewTab,
} from "@/lib/invoice-draft-list";

describe("invoiceReviewListPath", () => {
  const from = "2026-03-01";
  const to = "2026-03-31";

  it("date-filters the posted tab and nothing else", () => {
    // This used to assert from/to on *every* tab, which is the behaviour that
    // lost an invoice: the range defaults to the current month and filters on
    // the supplier's invoice date, so one dated 31 July and uploaded on
    // 8 August was in payables and on no tab of the review screen.
    //
    // A queue that hides work is not a queue. `posted` keeps the range
    // because browsing history by period is the point of that tab.
    // See invoice-review-range.test.ts for the rest.
    for (const tab of INVOICE_REVIEW_TABS) {
      const path = invoiceReviewListPath(tab.id, from, to);
      const filtered = path.includes(`from=${from}`);
      expect(filtered).toBe(tab.id === "posted");
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
