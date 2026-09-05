import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

describe("819 shell layout alignment", () => {
  it("ReportDateRange forks at the shell breakpoint, not sm/640", () => {
    const src = sourceDeclaring("ReportDateRange");
    expect(src).toContain("MOBILE_SHELL_ONLY");
    expect(src).toContain("DESKTOP_SHELL_ONLY");
    expect(src).not.toContain('className="sm:hidden"');
    expect(src).not.toContain('className="hidden sm:block"');
  });

  it("report KPI bands stay single-column under the shell", () => {
    for (const path of [
      "app/reports/profit-and-loss/page.tsx",
      "app/reports/balance-sheet/page.tsx",
      "app/reports/cash-flow/page.tsx",
      "app/reports/kdv-input/page.tsx",
    ]) {
      const src = sourceAt(path);
      expect(src, path).toContain("min-[820px]:grid-cols-3");
      expect(src, path).not.toContain("sm:grid-cols-3");
    }
  });

  it("SalesPostedKpiCards uses shell breakpoint for three columns", () => {
    const src = sourceDeclaring("SalesPostedKpiCards");
    expect(src).toContain("min-[820px]:grid-cols-3");
    expect(src).not.toContain("sm:grid-cols-3");
  });
});
