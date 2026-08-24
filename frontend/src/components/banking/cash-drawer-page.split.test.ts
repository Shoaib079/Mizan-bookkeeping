import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("CashDrawerPage split", () => {
  it("composes drawers + sessions + dialogs via hook (not a monolith)", () => {
    const page = sourceDeclaring("CashDrawerPage");
    expect(page).toContain("CashDrawersList");
    expect(page).toContain("CashDrawerSessionsPanel");
    expect(page).toContain("CashDrawerPageDialogs");
    expect(page).toContain("useCashDrawerPage");
    expect(page).toContain("cashPageWriteHeader");
  });

  it("mutation: reopen/list fetch lives in the hook, not the page shell", () => {
    const page = sourceDeclaring("CashDrawerPage");
    expect(page).not.toContain("apiFetch");
    expect(page).not.toContain("/cash/drawer-sessions");
    expect(page).not.toContain("newIdempotencyKey");
  });
});
