import { describe, expect, it } from "vitest";

import {
  LEGACY_BALANCE_REDIRECTS,
  sidebarHrefActiveForPathname,
} from "@/lib/nav-sections";

describe("balances on dashboard (legacy redirects)", () => {
  it("redirects legacy payables, receivables, and balances URLs to directories or home", () => {
    expect(LEGACY_BALANCE_REDIRECTS["/payables"]).toBe("/suppliers");
    expect(LEGACY_BALANCE_REDIRECTS["/receivables"]).toBe("/customers");
    expect(LEGACY_BALANCE_REDIRECTS["/balances"]).toBe("/");
    expect(LEGACY_BALANCE_REDIRECTS["/balances/staff"]).toBe("/staff");
  });

  it("highlights Suppliers and Customers for legacy balance URLs", () => {
    expect(sidebarHrefActiveForPathname("/suppliers", "/payables")).toBe(true);
    expect(sidebarHrefActiveForPathname("/customers", "/receivables")).toBe(true);
    expect(sidebarHrefActiveForPathname("/", "/balances")).toBe(true);
  });
});
