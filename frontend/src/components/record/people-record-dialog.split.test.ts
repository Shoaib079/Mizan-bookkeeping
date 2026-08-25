import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("PeopleRecordDialog split", () => {
  it("composes hook + embedded form (not a monolith)", () => {
    const page = sourceDeclaring("PeopleRecordDialog");
    expect(page).toContain("usePeopleRecordDialog");
    expect(page).toContain("renderEmbeddedForm");
    expect(page).toContain("pickerLabel");
  });

  it("mutation: list/ledger fetch lives in the hook, not the dialog shell", () => {
    const page = sourceDeclaring("PeopleRecordDialog");
    expect(page).not.toContain("apiFetch");
    expect(page).not.toContain("extractPartnerBalanceKurus");
  });
});
