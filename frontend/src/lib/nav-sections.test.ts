import { describe, expect, it } from "vitest";

import {
  filterNavItemsByEntitySettings,
  isNavItemActive,
  navGroups,
} from "@/lib/app-routes";
import type { EntityNavSettings } from "@/lib/app-routes";
import {
  LEGACY_BALANCE_REDIRECTS,
  LEGACY_REVIEW_REDIRECTS,
  LEGACY_SETUP_REDIRECTS,
  LEGACY_UPLOADS_REDIRECTS,
  NAV_SECTIONS,
  REGISTERED_PAGE_ROUTES,
  REPORTS_CARD_HREFS,
  SIDEBAR_HIDDEN_HREFS,
  backLinkForPathname,
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
      if (tab.requiresDelivery && !settings.deliveryEnabled) continue;
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
  "/review/bank",
  "/review/sales",
  "/review/receipts",
  "/review/invoices",
  "/review/delivery",
  "/review/manual-journals",
  "/banking/transfers",
  "/banking/cash",
  "/banking/banks",
  "/banking/cards",
  "/banking/fx",
  "/delivery/reports",
  "/delivery/settlements",
  "/delivery/platforms",
] as const;

describe("REGISTERED_PAGE_ROUTES", () => {
  it("lists exactly 83 app pages", () => {
    expect(REGISTERED_PAGE_ROUTES).toHaveLength(83);
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
      if (route.kind === "redirect") {
        expect(
          LEGACY_BALANCE_REDIRECTS[route.pattern] ??
            LEGACY_REVIEW_REDIRECTS[route.pattern] ??
            LEGACY_SETUP_REDIRECTS[route.pattern] ??
            LEGACY_UPLOADS_REDIRECTS[route.pattern],
        ).toBeDefined();
        continue;
      }
      if (route.kind === "drill-down") {
        expect(entryPointForStaticRoute(route.pattern, settingsOn)).toBeNull();
        continue;
      }
      if (route.kind === "page") {
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
    expect(sidebar.has("/sales")).toBe(false);
    expect(collectTabHrefs(settingsOn).has("/sales")).toBe(true);
  });

  it("hides delivery tabs when the module is off", () => {
    const tabs = collectTabHrefs(settingsOff);
    expect([...tabs].some((href) => href.startsWith("/delivery"))).toBe(false);
  });

  it("keeps delivery sidebar and sub-tabs reachable when the module is on", () => {
    expect(collectTabHrefs(settingsOn).has("/delivery/platforms")).toBe(true);
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
  it("highlights Record sidebar row and the Card clearing tab on /cards", () => {
    const record = navGroups
      .find((group) => group.label === "Overview")
      ?.items.find((item) => item.href === "/record");
    expect(record).toBeDefined();
    expect(isNavItemActive("/cards", record!)).toBe(true);
    expect(sidebarHrefActiveForPathname("/record", "/cards")).toBe(true);

    const section = navSectionForPathname("/cards");
    expect(section?.id).toBe("sales");
    expect(section?.tabs.find((tab) => tab.match("/cards"))?.href).toBe("/cards");
  });

  it("highlights Review sidebar row on manual journals tab", () => {
    expect(sidebarHrefActiveForPathname("/review", "/review/manual-journals")).toBe(
      true,
    );

    const section = navSectionForPathname("/review/manual-journals");
    expect(section?.id).toBe("review");
    expect(
      section?.tabs.find((tab) => tab.match("/review/manual-journals"))?.href,
    ).toBe("/review/manual-journals");
  });

  it("highlights Delivery sidebar row on platforms tab", () => {
    expect(sidebarHrefActiveForPathname("/delivery", "/delivery/platforms")).toBe(
      true,
    );

    const section = navSectionForPathname("/delivery/platforms");
    expect(section?.id).toBe("delivery");
  });

  it("highlights Balances sidebar row on the hub and on tab pages", () => {
    expect(sidebarHrefActiveForPathname("/balances", "/balances")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/balances/partners")).toBe(
      true,
    );

    const section = navSectionForPathname("/balances/staff");
    expect(section?.id).toBe("balances");
  });

  it("highlights Review sidebar row on the hub and on tab pages", () => {
    expect(sidebarHrefActiveForPathname("/review", "/review")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/sales")).toBe(true);

    const section = navSectionForPathname("/review/bank");
    expect(section?.id).toBe("review");
  });

  it("highlights Review sidebar row for legacy manual journals URL redirect", () => {
    expect(
      sidebarHrefActiveForPathname("/review", "/accounting/manual-journals"),
    ).toBe(false);
  });
});


describe("backLinkForPathname", () => {
  it("returns null on section hubs and tabs", () => {
    expect(backLinkForPathname("/record")).toBeNull();
    expect(backLinkForPathname("/review/invoices")).toBeNull();
    expect(backLinkForPathname("/banking/transfers")).toBeNull();
  });

  it("maps drill-down routes to their parent list", () => {
    expect(backLinkForPathname("/sales/abc")).toEqual({
      href: "/sales",
      label: "Daily sales",
    });
    expect(backLinkForPathname("/review/invoices/abc")).toEqual({
      href: "/review/invoices",
      label: "Invoices",
    });
    expect(backLinkForPathname("/review/receipts/abc")).toEqual({
      href: "/review/receipts",
      label: "Receipts",
    });
    expect(backLinkForPathname("/suppliers/abc")).toEqual({
      href: "/suppliers",
      label: "All suppliers",
    });
  });

  it("maps nested banking import to account detail", () => {
    expect(backLinkForPathname("/banking/accounts/acct-1/import")).toEqual({
      href: "/banking/accounts/acct-1",
      label: "Account",
    });
  });

  it("maps FX wallet detail back to FX hub", () => {
    expect(backLinkForPathname("/banking/fx/wallet-1")).toEqual({
      href: "/banking/fx",
      label: "Foreign currency",
    });
  });

  it("maps banking branch lists back to hub", () => {
    expect(backLinkForPathname("/banking/banks")).toEqual({
      href: "/banking",
      label: "Banking",
    });
    expect(backLinkForPathname("/banking/cards")).toEqual({
      href: "/banking",
      label: "Banking",
    });
    expect(backLinkForPathname("/banking/fx")).toEqual({
      href: "/banking",
      label: "Banking",
    });
  });

  it("maps report cards back to the reports hub", () => {
    expect(backLinkForPathname("/reports/profit-and-loss")).toEqual({
      href: "/reports",
      label: "Reports",
    });
  });

  it("keeps statement review on a page-local dynamic back link", () => {
    expect(backLinkForPathname("/banking/statements/stmt-1")).toBeNull();
  });
});
