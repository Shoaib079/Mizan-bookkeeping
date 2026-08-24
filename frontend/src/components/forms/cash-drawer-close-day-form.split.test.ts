import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("CashDrawerCloseDayForm split", () => {
  it("composes body + done + split via hook (not a monolith)", () => {
    const form = sourceDeclaring("CashDrawerCloseDayForm");
    expect(form).toContain("CashCloseDayFormBody");
    expect(form).toContain("CashCloseDayDone");
    expect(form).toContain("CashDrawerSplitPanel");
    expect(form).toContain("useCashDrawerCloseDay");
  });

  it("mutation: close-day POST lives in the hook, not the form shell", () => {
    const form = sourceDeclaring("CashDrawerCloseDayForm");
    expect(form).not.toContain("drawer-sessions/close-day");
    expect(form).not.toContain("apiFetch");
  });
});
