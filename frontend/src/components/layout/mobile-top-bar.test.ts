import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("MobileTopBar");

describe("MobileTopBar back navigation (C4)", () => {
  it("uses mobileBackDestination so review drill-ins do not loop via /review", () => {
    expect(source()).toContain("mobileBackDestination");
    expect(source()).not.toContain('router.push("/more")');
  });

  it("asks before leaving when a form has unsaved edits", () => {
    expect(source()).toContain("requestLeave");
  });
});
