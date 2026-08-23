import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

import { navGroups } from "@/lib/app-routes";



describe("balances on dashboard", () => {
  it("does not list Balances in the Overview sidebar", () => {
    const overview = navGroups.find((group) => group.label === "Overview");
    expect(overview?.items.map((item) => item.href)).not.toContain("/balances");
  });

  it("shows cash and bank together beside This period", () => {
    const page = sourceDeclaring("HomePage");
    const overview = sourceDeclaring("BalancesOverview");
    const snapshot = sourceDeclaring("CashBankSnapshotCard");
    expect(page).toContain("CashBankSnapshotCard");
    expect(page).toContain("lg:grid-cols-2");
    expect(page).toContain("cash_in_hand_kurus");
    expect(page).toContain("bank_balance_kurus");
    expect(page).toContain("cash_accounts");
    expect(snapshot).toContain("Cash & bank");
    expect(snapshot).toContain("Total cash & bank");
    expect(snapshot).toContain("Cash drawers");
    expect(snapshot).toContain("Bank accounts");
    expect(snapshot).toContain("sm:grid-cols-2");
    expect(snapshot).toContain("cash-drawer-row");
    expect(snapshot).toContain("BankAccountBalanceRows");
    expect(page).toContain("Right now");
    expect(page).toContain("BalancesOverview");
    expect(overview).not.toContain("bankAccounts.map");
    expect(overview).not.toContain('title="Cash"');
    expect(overview).not.toContain('title="Bank"');
  });

  it("redirects /balances to dashboard (same as desktop)", () => {
    const hub = sourceDeclaring("BalancesPage");
    expect(hub).toContain('redirect("/")');
  });

  it("redirects legacy balance directory aliases", () => {
    expect(sourceDeclaring("BalancesSuppliersRedirect")).toContain('redirect("/suppliers")');
    expect(sourceDeclaring("PayablesRedirect")).toContain(
      'redirect("/suppliers")',
    );
    expect(sourceDeclaring("ReceivablesRedirect")).toContain(
      'redirect("/customers")',
    );
  });

  it("payables card headline is Payables (not Total owed / You owe)", () => {
    const overview = sourceDeclaring("BalancesOverview");
    expect(overview).toMatch(/title=["']Payables["']/);
    expect(overview).not.toMatch(/title=["']Total owed["']/);
    expect(overview).not.toMatch(/title=["']You owe/);
    // Direction subtitle stays — wording for who is owed.
    expect(overview).toContain("Total owed to suppliers");
  });
});
