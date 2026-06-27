import { describe, expect, it } from "vitest";

import { appRoutes, navGroups, sidebarChildrenForNavItem } from "@/lib/app-routes";

const EXPECTED_SIDEBAR_GROUPS = [
  "Overview",
  "Sales",
  "Expenses & suppliers",
  "People",
  "Customers",
  "Cash & bank",
  "Reports",
  "Settings",
] as const;

const NON_NEW_ROUTES = appRoutes.filter((route) => !route.label.startsWith("New:"));

describe("navGroups", () => {
  it("uses plain-language sidebar sections instead of Books", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Books")).toBe(false);
  });

  it("lists Settings sub-pages in the sidebar, not the hub link", () => {
    const settings = navGroups.find((group) => group.label === "Settings");
    expect(settings?.items.map((item) => item.href)).toEqual([
      "/settings/entity",
      "/settings/opening-balances",
      "/settings/members",
    ]);
  });

  it("assigns Sales routes to the Sales group", () => {
    const sales = navGroups.find((group) => group.label === "Sales");
    expect(sales?.items.map((item) => item.href)).toEqual([
      "/sales",
      "/close-day",
      "/cards",
      "/delivery",
    ]);
  });

  it("assigns Cards under Sales per ROADMAP", () => {
    const cards = appRoutes.find((route) => route.href === "/cards" && !route.label.startsWith("New:"));
    expect(cards?.group).toBe("Sales");
  });

  it("keeps every non-New route in appRoutes", () => {
    const hrefs = new Set(NON_NEW_ROUTES.map((route) => `${route.href}::${route.label}`));
    const expected = [
      "/",
      "/sales",
      "/close-day",
      "/cards",
      "/delivery",
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
      "/expenses",
      "/uploads",
      "/suppliers",
      "/payables",
      "/staff",
      "/partners",
      "/customers",
      "/receivables",
      "/banking",
      "/banking/transfers",
      "/banking/cash",
      "/reports",
      "/reports/ledger",
      "/accounting/manual-journals",
      "/settings",
      "/settings/entity",
      "/settings/opening-balances",
      "/settings/members",
    ];
    for (const href of expected) {
      expect([...hrefs].some((key) => key.startsWith(`${href}::`))).toBe(true);
    }
  });
});

describe("sidebarChildrenForNavItem", () => {
  it("nests delivery children when delivery is enabled", () => {
    const children = sidebarChildrenForNavItem("/delivery", { deliveryEnabled: true });
    expect(children.map((child) => child.href)).toEqual([
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
    ]);
  });

  it("hides delivery children when the module is off", () => {
    expect(sidebarChildrenForNavItem("/delivery", { deliveryEnabled: false })).toEqual([]);
  });

  it("nests report children regardless of delivery setting", () => {
    const children = sidebarChildrenForNavItem("/reports", { deliveryEnabled: false });
    expect(children.map((child) => child.href)).toEqual([
      "/reports/ledger",
      "/accounting/manual-journals",
    ]);
  });
});
