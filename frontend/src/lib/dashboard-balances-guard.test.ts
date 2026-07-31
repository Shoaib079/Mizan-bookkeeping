import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { navGroups } from "@/lib/app-routes";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("balances on dashboard", () => {
  it("does not list Balances in the Overview sidebar", () => {
    const overview = navGroups.find((group) => group.label === "Overview");
    expect(overview?.items.map((item) => item.href)).not.toContain("/balances");
  });

  it("embeds BalancesOverview on the dashboard with a Right now section", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("BalancesOverview");
    expect(page).toContain("Right now");
    expect(page).toContain("embedded");
    expect(page).not.toContain("Money on hand");
  });

  it("redirects legacy /balances routes", () => {
    const hub = read("app/balances/page.tsx");
    expect(hub).toContain('redirect("/")');
    expect(read("app/balances/suppliers/page.tsx")).toContain('redirect("/suppliers")');
    expect(read("app/(procurement)/payables/page.tsx")).toContain(
      'redirect("/suppliers")',
    );
    expect(read("app/(customers-section)/receivables/page.tsx")).toContain(
      'redirect("/customers")',
    );
  });
});
