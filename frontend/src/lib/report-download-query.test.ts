import { describe, expect, it } from "vitest";

import { reportDownloadQuery } from "@/lib/report-download-query";
import { sourceDeclaring } from "@/test-support/source";

describe("reportDownloadQuery", () => {
  it("appends the page view to the period query", () => {
    expect(reportDownloadQuery("from=2026-06-01&to=2026-06-30", "live")).toBe(
      "from=2026-06-01&to=2026-06-30&view=live",
    );
    expect(reportDownloadQuery("as_of=2026-06-30", "as_closed")).toBe(
      "as_of=2026-06-30&view=as_closed",
    );
  });

  it("P&L and balance sheet downloads pass the page view into the helper", () => {
    for (const symbol of ["ProfitAndLossContent", "BalanceSheetContent"] as const) {
      const src = sourceDeclaring(symbol);
      expect(src).toMatch(/reportDownloadQuery\(/);
      expect(src).toMatch(/reportDownloadQuery\(\s*queryString\s*,\s*view\s*\)/);
    }
  });

  it("mutation: stripping view from the helper fails the contract", () => {
    // Guard the guard — if someone inlines the period query alone again,
    // this source scan goes red the same way the helper unit test would.
    const src = sourceDeclaring("reportDownloadQuery");
    expect(src).toMatch(/view=\$\{view\}/);
  });
});
