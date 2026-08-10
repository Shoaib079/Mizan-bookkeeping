/** A posted invoice can be acted on where you are looking at it.
 *
 * Reported: "review invoice has no date there but i can not edit it from
 * review invoice. i have to go to supplier or ledger to do so."
 *
 * The review screen is where you land after searching for an invoice — and
 * it was the one place that could not do anything to it. A read-only page
 * with a link, so correcting a figure meant finding the same invoice a
 * second time somewhere else.
 *
 * A source check rather than a render test: the point is that this screen
 * uses the *same* actions component as the ledger, so the two can never
 * offer different things for the same entry.
 */

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const REVIEW = sourceDeclaring("InvoiceDraftReview");

describe("posted invoice actions in review", () => {
  it("renders the ledger's own actions component", () => {
    // Not a second Edit button written here. One implementation means the
    // delivery-commission and supplier-invoice routes, the void paths and
    // the permission gates are shared rather than reimplemented.
    expect(REVIEW).toContain("<GlEntryActions");
    expect(REVIEW).toContain(
      'from "@/components/ledger/gl-entry-actions"',
    );
  });

  it("passes the source the entry was actually posted with", () => {
    // A commission and a supplier invoice resolve to different correction
    // routes; sending "invoice" for both would open the wrong form.
    expect(REVIEW).toContain(
      'source: isCommission ? "delivery_commission" : "invoice"',
    );
  });

  it("only offers them once the invoice is in the ledger", () => {
    // No journal entry means nothing to edit or void yet — the draft is
    // still going through review, where the existing buttons apply.
    expect(REVIEW).toContain("viewOnly && draft.journal_entry_id");
  });

  it("refreshes the screen after a correction", () => {
    // Otherwise the figures on screen are the ones that were just replaced.
    const block = REVIEW.slice(REVIEW.indexOf("<GlEntryActions"));
    expect(block.slice(0, 600)).toContain("onUpdated");
  });
});
