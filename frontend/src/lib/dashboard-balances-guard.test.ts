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

  it("shows cash and bank together beside This period", () => {
    const page = read("app/page.tsx");
    const overview = read("components/balances/balances-overview.tsx");
    const snapshot = read("components/dashboard/cash-bank-snapshot-card.tsx");
    expect(page).toContain("CashBankSnapshotCard");
    expect(page).toContain("lg:grid-cols-2");
    expect(page).toContain("cash_in_hand_kurus");
    expect(page).toContain("bank_balance_kurus");
    expect(snapshot).toContain("Cash & bank");
    expect(snapshot).toContain("Cash");
    expect(snapshot).toContain("Bank accounts");
    expect(snapshot).toContain("BankAccountBalanceRows");
    expect(page).toContain("Right now");
    expect(page).toContain("BalancesOverview");
    expect(overview).not.toContain("bankAccounts.map");
    expect(overview).not.toContain('title="Cash"');
    expect(overview).not.toContain('title="Bank"');
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
