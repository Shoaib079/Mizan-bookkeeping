import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("CustomerPaymentForm split", () => {
  it("composes fields via hook (not a monolith)", () => {
    const form = sourceDeclaring("CustomerPaymentForm");
    expect(form).toContain("CustomerPaymentFields");
    expect(form).toContain("useCustomerPaymentForm");
    expect(form).toContain("FormDialogShell");
  });

  it("mutation: submit/idempotency lives in the hook", () => {
    const form = sourceDeclaring("CustomerPaymentForm");
    expect(form).not.toContain("apiFetch");
    expect(form).not.toContain("/payments");
    expect(form).not.toContain("beginSubmit");
    expect(sourceDeclaring("useCustomerPaymentForm")).toContain("beginSubmit");
  });
});
