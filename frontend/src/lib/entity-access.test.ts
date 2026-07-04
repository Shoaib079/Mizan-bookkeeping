import { describe, expect, it } from "vitest";

import { appRoutes } from "@/lib/app-routes";
import {
  ROLE_PERMISSIONS,
  canWriteOperations,
  filterDashboardKpis,
  filterDeliveryReportCards,
  filterFinancialReportCards,
  filterNavItemsByEntitySettings,
  filterRoutesByEntitySettings,
  hasPermission,
  shouldShowNewMenu,
  shouldShowNetResultSummary,
  shouldShowWriteChrome,
} from "@/lib/entity-access";

describe("ROLE_PERMISSIONS matrix", () => {
  it("matches backend financial_reports:read rules", () => {
    expect(hasPermission("owner", "financial_reports:read")).toBe(true);
    expect(hasPermission("partner", "financial_reports:read")).toBe(true);
    expect(hasPermission("partner_view_only", "financial_reports:read")).toBe(true);
    expect(hasPermission("cashier", "financial_reports:read")).toBe(false);
  });

  it("matches backend operations:write rules", () => {
    expect(hasPermission("owner", "operations:write")).toBe(true);
    expect(hasPermission("cashier", "operations:write")).toBe(true);
    expect(hasPermission("partner_view_only", "operations:write")).toBe(false);
  });

  it("covers all four roles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([
      "cashier",
      "owner",
      "partner",
      "partner_view_only",
    ]);
  });
});

describe("write chrome helpers", () => {
  it("hides New menu and write actions for partner_view_only", () => {
    expect(shouldShowNewMenu("partner_view_only")).toBe(false);
    expect(shouldShowWriteChrome("partner_view_only")).toBe(false);
    expect(canWriteOperations("partner_view_only")).toBe(false);
  });

  it("shows write chrome for cashier and owner", () => {
    expect(shouldShowNewMenu("cashier")).toBe(true);
    expect(shouldShowWriteChrome("owner")).toBe(true);
  });
});

describe("filterDashboardKpis", () => {
  const kpis = [
    { key: "sales" as const, label: "Sales", value: "1 TL" },
    { key: "expenses" as const, label: "Expenses", value: "2 TL" },
    { key: "net_result" as const, label: "Net result", value: "3 TL" },
    { key: "payables" as const, label: "Payables", value: "4 TL" },
    { key: "receivables" as const, label: "Receivables", value: "5 TL" },
    { key: "try_position" as const, label: "TRY position", value: "6 TL" },
    { key: "needs_review" as const, label: "Needs review", value: "0" },
  ];

  it("keeps all KPIs for owner", () => {
    expect(filterDashboardKpis(kpis, "owner")).toHaveLength(7);
  });

  it("hides financial KPIs for cashier", () => {
    const filtered = filterDashboardKpis(kpis, "cashier");
    expect(filtered.map((k) => k.key)).toEqual([
      "sales",
      "expenses",
      "needs_review",
    ]);
  });

  it("hides net result summary for cashier", () => {
    expect(shouldShowNetResultSummary("cashier")).toBe(false);
    expect(shouldShowNetResultSummary("partner_view_only")).toBe(true);
  });
});

describe("filterFinancialReportCards", () => {
  const cards = [
    { href: "/reports/profit-and-loss", financial: true },
    { href: "/reports/kdv-input", financial: false },
  ];

  it("hides financial cards for cashier", () => {
    expect(filterFinancialReportCards(cards, "cashier")).toEqual([
      { href: "/reports/kdv-input", financial: false },
    ]);
  });
});

describe("delivery setting filters", () => {
  it("removes delivery routes when module is off", () => {
    const settings = { deliveryEnabled: false };
    const routes = filterRoutesByEntitySettings(appRoutes, settings);
    expect(routes.some((r) => r.href.startsWith("/delivery"))).toBe(false);
    expect(routes.some((r) => r.label === "New: Delivery report")).toBe(false);
  });

  it("hides delivery nav item from Overview when module is off", () => {
    const overview = appRoutes.filter((r) => r.group === "Overview" && !r.nestedUnder);
    const filtered = filterNavItemsByEntitySettings(overview, { deliveryEnabled: false });
    expect(filtered.some((r) => r.href === "/delivery")).toBe(false);
  });

  it("hides delivery report card when module is off", () => {
    const cards = [{ href: "/reports/delivery-sales" }, { href: "/reports/kdv-input" }];
    expect(filterDeliveryReportCards(cards, false)).toEqual([
      { href: "/reports/kdv-input" },
    ]);
  });
});
