/** What happens after an e-Fatura upload comes back.
 *
 * With auto-post on for a trusted supplier the invoice is already in the
 * ledger when the upload resolves. The form used to route to the review
 * screen regardless and toast "Invoice uploaded" — so finished work sat there
 * looking outstanding, and nothing said the ledger had been touched.
 */

import { describe, expect, it } from "vitest";

import { afterUpload } from "@/components/forms/efatura-upload-form";

const posted = {
  id: "draft-1",
  status: "posted",
  supplier_name: "METRO GROSMARKET",
  linked_supplier_name: null,
  gross_kurus: 123456,
};

const needsReview = {
  id: "draft-2",
  status: "needs_review",
  supplier_name: "Unknown Supplier",
  linked_supplier_name: null,
  gross_kurus: 5000,
};

describe("afterUpload", () => {
  it("stays put when the invoice already posted", () => {
    // The review screen has nothing to offer for an invoice that is done.
    expect(afterUpload(posted).navigateTo).toBeNull();
  });

  it("says it reached the ledger, with the supplier and the amount", () => {
    const { message } = afterUpload(posted);
    expect(message).toContain("Posted to the ledger");
    expect(message).toContain("METRO GROSMARKET");
    expect(message).toContain("1.234,56");
  });

  it("prefers the linked supplier's name over the one on the file", () => {
    // The linked name is the one in the books; the extracted one is whatever
    // the PDF happened to say.
    const { message } = afterUpload({
      ...posted,
      linked_supplier_name: "Metro Toptancı A.Ş.",
    });
    expect(message).toContain("Metro Toptancı A.Ş.");
    expect(message).not.toContain("METRO GROSMARKET");
  });

  it("still names the amount when no supplier could be read", () => {
    const { message } = afterUpload({
      ...posted,
      supplier_name: null,
      linked_supplier_name: null,
    });
    expect(message).toContain("Posted to the ledger");
    expect(message).toContain("1.234,56");
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
