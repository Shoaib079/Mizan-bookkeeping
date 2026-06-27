import { describe, expect, it } from "vitest";

import {
  filterNavItemsByEntitySettings,
  isNavItemActive,
  navGroups,
} from "@/lib/app-routes";
import type { EntityNavSettings } from "@/lib/app-routes";
import {
  NAV_SECTIONS,
  NEW_COMMAND_QUICK_ACTIONS,
  REGISTERED_PAGE_ROUTES,
  REPORTS_CARD_HREFS,
  SIDEBAR_HIDDEN_HREFS,
  navSectionForPathname,
  sidebarHrefActiveForPathname,
} from "@/lib/nav-sections";

function isDynamicPattern(pattern: string): boolean {
  return pattern.includes("[");
}

function collectSidebarEntryHrefs(settings: EntityNavSettings): Set<string> {
  const hrefs = new Set<string>(["/"]);
  for (const group of navGroups) {
    for (const item of filterNavItemsByEntitySettings(group.items, settings)) {
      hrefs.add(item.href);
    }
  }
  return hrefs;
}

function collectTabHrefs(settings: EntityNavSettings): Set<string> {
  const sections = settings.deliveryEnabled
    ? NAV_SECTIONS
    : NAV_SECTIONS.filter((section) => section.id !== "delivery");
  const hrefs = new Set<string>();
  for (const section of sections) {
    for (const tab of section.tabs) {
      hrefs.add(tab.href);
    }
  }
  return hrefs;
}

function collectReportsCardHrefs(): Set<string> {
  return new Set<string>(REPORTS_CARD_HREFS);
}

function entryPointForStaticRoute(
  pattern: string,
  settings: EntityNavSettings,
): "sidebar" | "tab" | "reports-card" | null {
  if (collectSidebarEntryHrefs(settings).has(pattern)) return "sidebar";
  if (collectTabHrefs(settings).has(pattern)) return "tab";
  if (collectReportsCardHrefs().has(pattern as (typeof REPORTS_CARD_HREFS)[number])) {
    return "reports-card";
  }
  return null;
}

/** Tab routes that must not also appear as their own sidebar row. */
const TAB_ONLY_HREFS = [
  "/cards",
  "/close-day",
  "/payables",
  "/receivables",
  "/banking/review",
  "/banking/transfers",
  "/banking/cash",
  "/settings/entity",
  "/settings/opening-balances",
  "/settings/members",
  "/delivery/platforms",
  "/delivery/reports",
  "/delivery/settlements",
] as const;

describe("REGISTERED_PAGE_ROUTES", () => {
  it("lists exactly 46 app pages", () => {
    expect(REGISTERED_PAGE_ROUTES).toHaveLength(46);
  });

  it("assigns each route exactly one entry kind", () => {
    const patterns = REGISTERED_PAGE_ROUTES.map((route) => route.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});

describe("route reachability guard", () => {
  const settingsOn: EntityNavSettings = { deliveryEnabled: true };
  const settingsOff: EntityNavSettings = { deliveryEnabled: false };

  it("maps every static non-auth route to its registered entry kind (delivery on)", () => {
    const staticRoutes = REGISTERED_PAGE_ROUTES.filter(
      (route) => route.kind !== "auth" && !isDynamicPattern(route.pattern),
    );

    for (const route of staticRoutes) {
      if (route.kind === "drill-down") {
        expect(entryPointForStaticRoute(route.pattern, settingsOn)).toBeNull();
        continue;
      }
      if (route.kind === "sidebar") {
        expect(collectSidebarEntryHrefs(settingsOn).has(route.pattern)).toBe(true);
        continue;
      }
      if (route.kind === "tab") {
        expect(collectTabHrefs(settingsOn).has(route.pattern)).toBe(true);
        continue;
      }
      if (route.kind === "reports-card") {
        expect(
          collectReportsCardHrefs().has(
            route.pattern as (typeof REPORTS_CARD_HREFS)[number],
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps tab-only routes off the sidebar while allowing section hub overlap", () => {
    const sidebar = collectSidebarEntryHrefs(settingsOn);
    for (const href of TAB_ONLY_HREFS) {
      expect(sidebar.has(href)).toBe(false);
    }
    expect(sidebar.has("/sales")).toBe(true);
    expect(collectTabHrefs(settingsOn).has("/sales")).toBe(true);
  });

  it("hides delivery entry points when the module is off", () => {
    const sidebar = collectSidebarEntryHrefs(settingsOff);
    const tabs = collectTabHrefs(settingsOff);
    expect(sidebar.has("/delivery")).toBe(false);
    expect([...tabs].some((href) => href.startsWith("/delivery"))).toBe(false);
  });

  it("keeps delivery routes reachable when the module is on", () => {
    expect(collectTabHrefs(settingsOn).has("/delivery")).toBe(true);
    expect(collectSidebarEntryHrefs(settingsOn).has("/delivery")).toBe(true);
  });

  it("marks drill-down routes separately from tabs and sidebar rows", () => {
    const drillDowns = REGISTERED_PAGE_ROUTES.filter((route) => route.kind === "drill-down");
    expect(drillDowns.length).toBeGreaterThan(0);
    for (const route of drillDowns) {
      expect(isDynamicPattern(route.pattern)).toBe(true);
    }
  });
});

describe("SIDEBAR_HIDDEN_HREFS", () => {
  it("hides tab-only and report-card routes from the sidebar", () => {
    for (const href of SIDEBAR_HIDDEN_HREFS) {
      expect(
        navGroups.some((group) => group.items.some((item) => item.href === href)),
      ).toBe(false);
    }
  });
});

describe("tab + sidebar highlighting", () => {
  it("highlights Sales sidebar row and the Card clearing tab on /cards", () => {
    const sales = navGroups
      .find((group) => group.label === "Sales")
      ?.items.find((item) => item.href === "/sales");
    expect(sales).toBeDefined();
    expect(isNavItemActive("/cards", sales!)).toBe(true);
    expect(sidebarHrefActiveForPathname("/sales", "/cards")).toBe(true);

    const section = navSectionForPathname("/cards");
    expect(section?.id).toBe("sales");
    const activeTab = section?.tabs.find((tab) => tab.match("/cards"));
    expect(activeTab?.href).toBe("/cards");
    expect(section?.tabs.find((tab) => tab.href === "/sales")?.match("/cards")).toBe(
      false,
    );
  });

  it("highlights Settings sidebar row on the hub and on tab pages", () => {
    expect(sidebarHrefActiveForPathname("/settings", "/settings")).toBe(true);
    expect(sidebarHrefActiveForPathname("/settings", "/settings/members")).toBe(true);

    const section = navSectionForPathname("/settings/opening-balances");
    expect(section?.id).toBe("settings");
    expect(section?.tabs.find((tab) => tab.match("/settings/opening-balances"))?.href).toBe(
      "/settings/opening-balances",
    );
  });

  it("highlights Reports sidebar row for ledger and manual journals", () => {
    expect(sidebarHrefActiveForPathname("/reports", "/reports/ledger")).toBe(true);
    expect(sidebarHrefActiveForPathname("/reports", "/accounting/manual-journals")).toBe(
      true,
    );
  });
});

describe("NEW_COMMAND_QUICK_ACTIONS", () => {
  it("maps every modal New: palette label to a quick action key", () => {
    expect(Object.keys(NEW_COMMAND_QUICK_ACTIONS)).toEqual([
      "New: Manual expense",
      "New: Daily sales (manual)",
      "New: POS summary (photo)",
      "New: Delivery report",
      "New: Expense receipt (photo)",
      "New: Supplier",
      "New: Supplier invoice (e-Fatura)",
    ]);
  });
});
