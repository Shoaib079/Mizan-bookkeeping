import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("OpeningBalancesPage split", () => {
  it("composes lines panel + journal preview + hook (not a monolith)", () => {
    const page = sourceDeclaring("OpeningBalancesPage");
    expect(page).toContain("OpeningBalancesLinesPanel");
    expect(page).toContain("OpeningBalancesJournalPreview");
    expect(page).toContain("useOpeningBalances");
    expect(page).toContain("<FormPage");
  });

  it("mutation: validate/post apiFetch lives in the hook, not the page shell", () => {
    const page = sourceDeclaring("OpeningBalancesPage");
    const hook = sourceDeclaring("useOpeningBalances");
    expect(page).not.toContain("apiFetch");
    expect(hook).toContain("opening-balances/validate");
    expect(hook).toContain("opening-balances/post");
  });
});
