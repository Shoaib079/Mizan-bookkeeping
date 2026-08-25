import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("CommandPalette split", () => {
  it("composes panel via hook (not a monolith)", () => {
    const page = sourceDeclaring("CommandPalette");
    expect(page).toContain("CommandPalettePanel");
    expect(page).toContain("useCommandPalette");
  });

  it("mutation: search/select lives in the hook", () => {
    const page = sourceDeclaring("CommandPalette");
    expect(page).not.toContain("searchSuppliers");
    expect(page).not.toContain("PALETTE_SEARCH_DEBOUNCE_MS");
    expect(sourceDeclaring("useCommandPalette")).toContain("searchSuppliers");
  });
});
