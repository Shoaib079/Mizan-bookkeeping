import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

import { navGroups } from "@/lib/app-routes";

const home = () =>
  sourceDeclaringAll("HomePage", "DashboardHomeContent");

describe("balances on dashboard", () => {
  it("does not list Balances in the Overview sidebar", () => {
    const overview = navGroups.find((group) => group.label === "Overview");
    expect(overview?.items.map((item) => item.href)).not.toContain("/balances");
  });

  it("shows Cash & bank as-of; This period and range controls gone", () => {
    const page = home();
    const overview = sourceDeclaring("BalancesOverview");
    const snapshot = sourceDeclaring("CashBankSnapshotCard");
    expect(page).toContain("CashBankSnapshotCard");
    expect(page).toContain("dashboard-kpi-row");
    expect(page).toContain("DashboardV2Header");
    expect(page).not.toContain("useNewLookTheme");
    expect(page).toContain('data-layout="as-of-cash"');
    expect(page).not.toContain('label="This period"');
    expect(page).not.toContain("period-and-cash");
    expect(page).not.toContain("ReportDateRange");
    expect(page).not.toContain("ReportDateRangeFields");
    expect(page).not.toContain("ReportPeriodTrigger");
    expect(page).not.toContain("periodControl=");
    expect(page).toContain("cash_in_hand_kurus");
    expect(page).toContain("bank_balance_kurus");
    expect(page).toContain("cash_accounts");
    expect(page).toContain("currentMonthRange");
    expect(page).toContain("interactive={false}");
    expect(snapshot).toContain("Cash & bank");
    expect(snapshot).toContain("Total balance");
    expect(snapshot).toContain("as of today");
    expect(snapshot).toContain("cash-bank-total-figure");
    expect(page).toContain("Balances");
    expect(page).toContain("BalancesOverview");
    expect(page).toContain("compact");
    expect(page).toContain("DashboardMonthlySales");
    expect(page).toContain("DashboardTopExpenses");
    expect(page).not.toContain("WeeklyChart");
    expect(page).not.toContain("delivery_balance_left");
    expect(page).not.toContain("confirmed_invoice_drafts");
    expect(overview).not.toContain("bankAccounts.map");
  });

  it("mutation: This period card reappears on dashboard → red", () => {
    const page = home();
    expect(page).toContain('data-layout="as-of-cash"');
    expect(page).not.toContain('label="This period"');
    expect(page).not.toContain("period-and-cash");
    expect(page).not.toContain("v2-cash-bank-only");
    expect(page).not.toContain("net_result_kurus");
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
    expect(overview).toMatch(/title=["']Payables["']|label=["']Payables["']/);
    expect(overview).not.toMatch(/title=["']Total owed["']/);
    expect(overview).not.toMatch(/title=["']You owe/);
    expect(overview).toContain("payablesOverviewDisplay");
    expect(sourceDeclaring("payablesOverviewDisplay")).toContain(
      "Total owed to suppliers",
    );
  });
});
