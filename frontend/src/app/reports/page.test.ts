import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("reports landing (UX4)", () => {
  it("lists financial statement cards including general ledger", () => {
    const source = sourceDeclaring("ReportsPage");
    expect(source).toContain("/reports/profit-and-loss");
    expect(source).toContain("/reports/period-comparison");
    expect(source).toContain("/reports/ledger");
    expect(source).toContain("General ledger");
    expect(source).toContain("Financial statements");
    expect(source).not.toContain("/accounting/manual-journals");
    expect(source).not.toContain("Manual journals");
  });
});
