import { describe, expect, it } from "vitest";

import { MORE_NAV_ITEMS } from "@/components/layout/mobile-more-menu";
import { sourceDeclaring } from "@/test-support/source";

describe("mobile more menu", () => {
  it("lists Review and Split; one app search — no Filter list", () => {
    expect(MORE_NAV_ITEMS.map((item) => item.label)).toEqual([
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
    const source = sourceDeclaring("MobileMoreMenu");
    expect(source).not.toContain("Money in");
    expect(source).toContain("mizan:command-palette");
    expect(source).toContain("Search the app");
    expect(source).toContain("NavCountBadge");
    expect(source).not.toContain("Filter list");
    expect(source).not.toContain("matchesMoreNavSearch");
    expect(source).not.toContain("useState");
    expect(source).not.toContain("No matches");
  });

  it("bottom tabs put Sales after Home and drop Review", () => {
    const source = sourceDeclaring("MobileBottomTabs");
    expect(source).toContain('label="Sales"');
    expect(source).toContain('href="/sales"');
    expect(source).not.toContain('label="Review"');
    expect(source).not.toContain("reviewTotal");
    expect(source).not.toContain("ScanSearch");
  });

  it("top bar exposes app search on tab roots", () => {
    const source = sourceDeclaring("MobileTopBar");
    expect(source).toContain("mizan:command-palette");
    expect(source).toContain('aria-label="Search"');
  });
});
