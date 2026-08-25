import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("PartnerRecordForm split", () => {
  it("composes fields via hook (not a monolith)", () => {
    const form = sourceDeclaring("PartnerRecordForm");
    expect(form).toContain("PartnerRecordFields");
    expect(form).toContain("usePartnerRecordForm");
    expect(form).toContain("FormDialogShell");
  });

  it("mutation: post paths live in the hook, not the dialog shell", () => {
    const form = sourceDeclaring("PartnerRecordForm");
    expect(form).not.toContain("apiFetch");
    expect(form).not.toContain("/cash-payments");
    expect(form).not.toContain("beginSubmit");
  });
});
