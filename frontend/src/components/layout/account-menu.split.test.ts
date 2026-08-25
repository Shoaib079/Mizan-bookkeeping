import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("AccountMenu split", () => {
  it("composes trigger + dropdown + confirms via hook (not a monolith)", () => {
    const page = sourceDeclaring("AccountMenuPanel");
    expect(page).toContain("AccountMenuTrigger");
    expect(page).toContain("AccountMenuDropdown");
    expect(page).toContain("AccountMenuConfirmOverlay");
    expect(page).toContain("useAccountMenuPanel");
  });

  it("mutation: switch/sign-out flow lives in the hook", () => {
    const page = sourceDeclaring("AccountMenuPanel");
    expect(page).not.toContain("redirectToDashboard");
    expect(page).not.toContain("hasUnsavedWork");
    expect(sourceDeclaring("useAccountMenuPanel")).toContain(
      "redirectToDashboard: true",
    );
  });
});
