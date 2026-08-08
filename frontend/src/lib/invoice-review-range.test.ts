/** The review queues must not be date-filtered.
 *
 * Reported: an invoice uploaded and auto-posted was visible in payables and
 * nowhere else — "i can see the payables but i can not see the invoice or
 * transaction", and re-uploading said it was already there. All three are the
 * same fact seen from three angles.
 *
 * The cause: the review list defaulted to the current month and filtered on
 * `invoice_date` — the supplier's date, not the day of upload. An invoice
 * dated 31 July uploaded on 8 August fell outside the window on every tab.
 * That is the ordinary case, not an edge one: last month's invoices get
 * uploaded at the start of this month.
 *
 * Payables has no date filter, which is why it alone showed the invoice.
 */

import { describe, expect, it } from "vitest";

import {
  INVOICE_REVIEW_TABS,
  invoiceReviewEmptyState,
  invoiceReviewListPath,
  invoiceReviewTabUsesRange,
} from "@/lib/invoice-draft-list";

const FROM = "2026-08-01";
const TO = "2026-08-31";

describe("invoiceReviewListPath", () => {
  it("does not date-filter the pending queue", () => {
    const path = invoiceReviewListPath("pending", FROM, TO);
    expect(path).not.toContain("from=");
    expect(path).not.toContain("to=");
  });

  it("does not date-filter ready-to-post", () => {
    const path = invoiceReviewListPath("ready", FROM, TO);
    expect(path).not.toContain("from=");
    expect(path).toContain("status=confirmed");
  });

  it("does not date-filter the all tab", () => {
    expect(invoiceReviewListPath("all", FROM, TO)).not.toContain("from=");
  });

  it("keeps the range on posted, where a period is the point", () => {
    const path = invoiceReviewListPath("posted", FROM, TO);
    expect(path).toContain(`from=${FROM}`);
    expect(path).toContain(`to=${TO}`);
    expect(path).toContain("status=posted");
  });
});

describe("invoiceReviewTabUsesRange", () => {
  it("agrees with what the paths actually do", () => {
    // Otherwise the toolbar shows a date picker that changes nothing — which
    // is worse than none, since it is the first thing anyone reaches for when
    // an invoice seems missing.
    for (const { id } of INVOICE_REVIEW_TABS) {
      const path = invoiceReviewListPath(id, FROM, TO);
      expect(invoiceReviewTabUsesRange(id)).toBe(path.includes("from="));
    }
  });
});

describe("invoiceReviewEmptyState", () => {
  it("stops telling people to change dates that are not applied", () => {
    for (const id of ["pending", "ready", "all"] as const) {
      const { hint } = invoiceReviewEmptyState(id);
      expect(hint.toLowerCase()).not.toContain("date");
      expect(hint.toLowerCase()).not.toContain("period");
    }
  });

  it("still mentions the period on the posted tab", () => {
    expect(invoiceReviewEmptyState("posted").hint.toLowerCase()).toContain(
      "date",
    );
  });
});
