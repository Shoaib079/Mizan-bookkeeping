/** What happens after an e-Fatura upload comes back.
 *
 * With auto-post on for a trusted supplier the invoice is already in the
 * ledger when the upload resolves. The form used to route to the review
 * screen regardless and toast "Invoice uploaded" — so finished work sat there
 * looking outstanding, and nothing said the ledger had been touched.
 */

import { describe, expect, it } from "vitest";

import {
  afterUpload,
  receiptAmount,
  receiptSupplier,
} from "@/components/forms/efatura-upload-form";

const posted = {
  id: "draft-1",
  status: "posted",
  supplier_name: "METRO GROSMARKET",
  linked_supplier_name: null,
  invoice_number: "EF2026000123",
  invoice_date: "2026-08-07",
  net_kurus: 102880,
  gross_kurus: 123456,
  currency: "TRY",
  journal_entry_id: "entry-1",
};

const needsReview = {
  ...posted,
  id: "draft-2",
  status: "needs_review",
  supplier_name: "Unknown Supplier",
  gross_kurus: 5000,
  journal_entry_id: null,
};

describe("afterUpload", () => {
  it("stays put when the invoice already posted", () => {
    // The review screen has nothing to offer for an invoice that is done.
    expect(afterUpload(posted).navigateTo).toBeNull();
  });

  it("shows a receipt rather than a fading line", () => {
    // Auto-post puts money in the books without anyone reading a screen, so
    // the one moment it can be checked is now. A toast is gone in four
    // seconds and was, on a phone, never visible at all.
    const { showReceipt, message } = afterUpload(posted);
    expect(showReceipt).toBe(true);
    expect(message).toBeNull();
  });

  it("names the supplier the books know, not the one on the file", () => {
    // The linked name is the supplier in the ledger; the extracted one is
    // whatever the PDF happened to say.
    expect(
      receiptSupplier({ ...posted, linked_supplier_name: "Metro Toptancı A.Ş." }),
    ).toBe("Metro Toptancı A.Ş.");
    expect(receiptSupplier(posted)).toBe("METRO GROSMARKET");
  });

  it("falls back rather than showing an empty supplier", () => {
    expect(
      receiptSupplier({
        ...posted,
        supplier_name: null,
        linked_supplier_name: null,
      }),
    ).toBe("Unknown supplier");
  });

  it("shows gross as the total", () => {
    // Gross is what reaches payables and what is printed on the paper.
    expect(receiptAmount(posted)).toContain("1.234,56");
  });

  it("routes to review when the invoice was not posted", () => {
    const { message, navigateTo } = afterUpload(needsReview);
    expect(message).toBe("Invoice uploaded");
    expect(navigateTo).toBe("/record?invoice=draft-2");
  });

  it("routes back to the supplier when the upload started there", () => {
    expect(afterUpload(needsReview, "sup-9").navigateTo).toBe(
      "/suppliers/sup-9?draft=draft-2",
    );
  });

  it("does not treat a confirmed-but-unposted draft as done", () => {
    // Auto-post confirms first, then posts. A draft stuck between the two is
    // exactly the one that needs a human, so it must not be waved through.
    expect(afterUpload({ ...posted, status: "confirmed" }).navigateTo).not.toBeNull();
  });
});
