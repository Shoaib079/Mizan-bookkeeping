import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("HomePage");

describe("dashboard is status-only (recording lives on Add)", () => {
  it("does not show recent entries or daily recording shortcuts", () => {
    expect(source()).not.toContain("<RecentEntriesCard");
    expect(source()).not.toContain('openQuickAction("sales")');
    expect(source()).not.toContain('openQuickAction("expense")');
    expect(source()).not.toContain('openRecordAction("closeDay")');
    expect(source()).not.toMatch(/Daily sales/);
    expect(source()).not.toMatch(/Daily expenses/);
  });

  it("still shows period KPIs and balances", () => {
    expect(source()).toContain("This period");
    expect(source()).toContain("CashBankSnapshotCard");
    expect(source()).toContain("<BalancesOverview");
    expect(source()).toContain("<WeeklyChart");
  });
});
