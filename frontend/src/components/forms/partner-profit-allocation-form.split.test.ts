import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("PartnerProfitAllocationForm split", () => {
  it("composes fields + preview via hook (not a monolith)", () => {
    const form = sourceDeclaring("PartnerProfitAllocationForm");
    expect(form).toContain("PartnerProfitAllocationFields");
    expect(form).toContain("PartnerProfitAllocationPreview");
    expect(form).toContain("usePartnerProfitAllocationForm");
  });

  it("mutation: preview/post live in the hook, not the dialog shell", () => {
    const form = sourceDeclaring("PartnerProfitAllocationForm");
    expect(form).not.toContain("apiFetch");
    expect(form).not.toContain("/partners/profit-allocation");
    expect(form).not.toContain("beginSubmit");
  });
});
