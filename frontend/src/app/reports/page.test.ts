import { describe, expect, it } from "vitest";

async function readReportsPageSource() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
  );
}

describe("reports landing (UX4)", () => {
  it("lists financial statement cards only — no ledger or manual journals", async () => {
    const source = await readReportsPageSource();
    expect(source).toContain("/reports/profit-and-loss");
    expect(source).toContain("/reports/period-comparison");
    expect(source).not.toContain("/review/posted");
    expect(source).not.toContain("/accounting/manual-journals");
    expect(source).not.toContain("General ledger");
    expect(source).not.toContain("Manual journals");
  });
});
