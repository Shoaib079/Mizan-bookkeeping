import { describe, expect, it } from "vitest";

import { MORE_NAV_ITEMS } from "@/components/layout/mobile-more-menu";
import { sourceDeclaring } from "@/test-support/source";

/** Source guard: list panels must fork to MobileCardList on phone. */
describe("mobile UX gaps — card list forks", () => {
  it("BankActivityPanel uses MobileCardList", () => {
    const source = sourceDeclaring("BankActivityPanel");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("StatementLinesLedger uses MobileCardList", () => {
    const source = sourceDeclaring("StatementLinesLedger");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("DeliveryReportsPanel wires a MobileCardList fork", () => {
    const panel = sourceDeclaring("DeliveryReportsPanel");
    expect(panel).toContain("DeliveryReportsList");
    expect(panel).toContain("useIsMobileShell");
    expect(sourceDeclaring("DeliveryReportsList")).toContain("MobileCardList");
  });

  it("DeliverySettlementsPanel wires a MobileCardList fork", () => {
    const panel = sourceDeclaring("DeliverySettlementsPanel");
    expect(panel).toContain("DeliverySettlementsList");
    expect(panel).toContain("useIsMobileShell");
    expect(sourceDeclaring("DeliverySettlementsList")).toContain(
      "MobileCardList",
    );
  });

  it("SplitPaymentList uses MobileCardList", () => {
    const source = sourceDeclaring("SplitPaymentList");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("SplitExpenseList uses MobileCardList", () => {
    const source = sourceDeclaring("SplitExpenseList");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("CashDrawerSessionsPanel uses MobileCardList", () => {
    const source = sourceDeclaring("CashDrawerSessionsPanel");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("FxHubLedger uses MobileCardList", () => {
    const source = sourceDeclaring("FxHubLedger");
    expect(source).toContain("MobileCardList");
    expect(source).toContain("useIsMobileShell");
  });

  it("RecentEntriesCard forks to MobileCardList on phone", () => {
    const card = sourceDeclaring("RecentEntriesCard");
    expect(card).toContain("useIsMobileShell");
    expect(card).toContain("RecentEntriesMobileList");
    expect(sourceDeclaring("RecentEntriesMobileList")).toContain(
      "MobileCardList",
    );
  });

  it("MORE lists Review and Split and opens the command palette", () => {
    const source = sourceDeclaring("MobileMoreMenu");
    expect(source).toContain('href: "/review"');
    expect(source).toContain('href: "/split"');
    expect(source).toContain("mizan:command-palette");
    expect(MORE_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Review",
      "Delivery",
      "Customers",
      "Suppliers",
      "Staff",
      "Partners",
      "Split",
      "Cards",
      "Reports",
    ]);
  });
});

describe("section tabs scroll tray", () => {
  it("SectionTabs uses horizontal scroll instead of wrap", () => {
    const source = sourceDeclaring("SectionTabs");
    expect(source).toContain("TAB_TRACK_SCROLL");
    expect(source).not.toContain("TAB_TRACK_WRAP");
    const track = sourceDeclaring("TAB_TRACK_SCROLL");
    expect(track).toMatch(
      /TAB_TRACK_SCROLL\s*=\s*cn\(\s*[^)]*overflow-x-auto/,
    );
    expect(track).toMatch(
      /TAB_TRACK_SCROLL\s*=\s*cn\(\s*[^)]*flex-nowrap/,
    );
    expect(track).toMatch(
      /TAB_TRACK_SCROLL\s*=\s*cn\(\s*[^)]*whitespace-nowrap/,
    );
  });
});
