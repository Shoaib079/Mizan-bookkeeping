/** Partner Record cash copy — one headline figure, no fronted/net breakdown. */

import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("PartnerRecordForm — cash taken copy", () => {
  it("shows the net headline and a plain settle sentence, no fronted breakdown", () => {
    const src = sourceDeclaring("PartnerRecordForm");

    expect(src).toContain("partnerBalanceHeading");
    expect(src).toContain("partnerBalanceAmount");
    expect(src).toContain(
      "This payment settles what you owe first; any extra is a withdrawal.",
    );

    expect(src).not.toContain("Fronted still owed");
    expect(src).not.toContain("Net book:");
    expect(src).not.toContain("formatPartnerNetBalance");
  });
});
