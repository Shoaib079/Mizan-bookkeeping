import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Phone shell: mapping first, sticky Import, no double title, touch targets. */
describe("statement import mobile", () => {
  it("maps columns above preview under the 819 shell", () => {
    const panel = sourceDeclaring("StatementImportPanel");
    expect(panel).toContain("max-[819px]:order-1");
    expect(panel).toContain("max-[819px]:order-2");
    expect(panel).toContain("MOBILE_TAB_BAR_OFFSET");
    expect(panel).toContain("MOBILE_SHELL_ONLY");
    expect(panel).toContain("DESKTOP_SHELL_ONLY");
  });

  it("keeps Import in the sidebar on desktop only", () => {
    const sidebar = sourceDeclaring("StatementImportMapSidebar");
    expect(sidebar).toContain("min-[820px]:flex");
    expect(sidebar).toContain("MOBILE_TOUCH_TARGET");
    expect(sidebar).toContain("Importing");
    expect(sidebar).toMatch(/Other file/);
  });

  it("caps preview height and enlarges assign chips on phone", () => {
    const table = sourceDeclaring("StatementPreviewTable");
    expect(table).toContain("max-h-[min(40vh,280px)]");
    expect(table).toContain("min-[820px]:max-h-[min(60vh,520px)]");

    const preview = sourceDeclaring("StatementImportMapPreview");
    expect(preview).toContain("MOBILE_TOUCH_TARGET");

    const columnSelect = sourceDeclaring("ColumnSelect");
    expect(columnSelect).toContain("MOBILE_TOUCH_TARGET");
  });
});
