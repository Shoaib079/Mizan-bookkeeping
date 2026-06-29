import { describe, expect, it } from "vitest";

import {
  LEGACY_BALANCE_REDIRECTS,
  navSectionForPathname,
  sidebarHrefActiveForPathname,
} from "@/lib/nav-sections";

describe("balances hub navigation", () => {
  it("maps legacy payables and receivables URLs to balances tabs", () => {
    expect(LEGACY_BALANCE_REDIRECTS["/payables"]).toBe("/balances/suppliers");
    expect(LEGACY_BALANCE_REDIRECTS["/receivables"]).toBe("/balances/customers");
  });

  it("highlights Balances sidebar on hub and tab routes", () => {
    expect(sidebarHrefActiveForPathname("/balances", "/balances/suppliers")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/balances", "/balances/staff")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/payables")).toBe(true);
  });

  it("resolves balances section tabs", () => {
    const section = navSectionForPathname("/balances/customers");
    expect(section?.id).toBe("balances");
    expect(section?.tabs.find((tab) => tab.match("/balances/customers"))?.label).toBe(
      "Customers",
    );
  });
});
