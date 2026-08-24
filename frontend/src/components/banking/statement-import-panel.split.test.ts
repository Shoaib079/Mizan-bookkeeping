import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** File-size split must keep StatementImportPanel as a thin compose shell. */
describe("StatementImportPanel split", () => {
  it("composes pick / preview / sidebar + hook (not a monolith)", () => {
    const panelSrc = sourceDeclaring("StatementImportPanel");
    expect(panelSrc).toContain("StatementImportPickStep");
    expect(panelSrc).toContain("StatementImportMapPreview");
    expect(panelSrc).toContain("StatementImportMapSidebar");
    expect(panelSrc).toContain("useStatementImport");
  });

  it("mutation: inlining preview load / submit into the panel fails", () => {
    const panelSrc = sourceDeclaring("StatementImportPanel");
    expect(panelSrc).not.toContain("apiFetch");
    expect(panelSrc).not.toContain("trackInflightStatementPreview");
    expect(panelSrc).not.toContain("writeStatementImportSession");
  });
});
