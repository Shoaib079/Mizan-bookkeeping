import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("InvoiceDraftReview split", () => {
  it("composes summary + action forms + hook (not a monolith)", () => {
    const panel = sourceDeclaring("InvoiceDraftReview");
    expect(panel).toContain("InvoiceDraftSummary");
    expect(panel).toContain("InvoiceDraftActionForms");
    expect(panel).toContain("useInvoiceDraftReview");
    expect(panel).toContain("invoiceDraftCapabilities");
  });

  it("mutation: inlining mutate apiFetch into the panel fails", () => {
    const panel = sourceDeclaring("InvoiceDraftReview");
    expect(panel).not.toContain("apiFetch");
    expect(panel).not.toContain("beginSubmit");
  });
});
