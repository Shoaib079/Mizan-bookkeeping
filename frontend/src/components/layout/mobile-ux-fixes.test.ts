import { describe, expect, it } from "vitest";

import {
  matchesMoreNavSearch,
  MORE_NAV_ITEMS,
} from "@/components/layout/mobile-more-menu";
import { sourceDeclaring } from "@/test-support/source";

describe("mobile more menu", () => {
  it("lists a flat Navigation set without Sales or section headers", () => {
    expect(MORE_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Delivery",
      "Customers",
      "Suppliers",
      "Staff",
      "Partners",
      "Cards",
      "Reports",
    ]);
    const source = sourceDeclaring("MobileMoreMenu");
    expect(source).not.toContain("Money in");
    expect(source).not.toContain("Money out");
    expect(source).not.toContain("Money held");
    expect(source).not.toContain("Understand");
    expect(source).toContain('placeholder="Search..."');
    expect(source).toContain("matchesMoreNavSearch");
  });

  it("filters by label case-insensitively", () => {
    expect(matchesMoreNavSearch("Customers", "")).toBe(true);
    expect(matchesMoreNavSearch("Customers", "  cust ")).toBe(true);
    expect(matchesMoreNavSearch("Staff", "partner")).toBe(false);
    expect(matchesMoreNavSearch("Settings", "set")).toBe(true);
  });

  it("bottom tabs put Sales after Home and drop Review", () => {
    const source = sourceDeclaring("MobileBottomTabs");
    expect(source).toContain('label="Sales"');
    expect(source).toContain('href="/sales"');
    expect(source).not.toContain('label="Review"');
    expect(source).not.toContain("reviewTotal");
    expect(source).not.toContain("ScanSearch");
  });
});
