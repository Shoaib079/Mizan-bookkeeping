import { describe, expect, it } from "vitest";

import {
  canAccessAppPath,
  canModifyEntryDate,
  canSwitchEntity,
  canWriteOperations,
  filterAppRoutesForGrants,
  filterDashboardKpis,
  filterFinancialReportCards,
  shouldShowWriteChrome,
  visibleEntitiesForRole,
} from "@/lib/entity-access";
import { grantsForRole } from "@/lib/member-grants";

describe("grant-based entity access", () => {
  const ownerGrants = grantsForRole("owner");
  const cashierGrants = grantsForRole("cashier");
  const viewOnlyGrants = grantsForRole("partner_view_only");

  it("owner has full operations write", () => {
    expect(canWriteOperations(ownerGrants)).toBe(true);
    expect(canWriteOperations(cashierGrants)).toBe(false);
    expect(shouldShowWriteChrome(viewOnlyGrants)).toBe(false);
    expect(shouldShowWriteChrome(ownerGrants)).toBe(true);
  });

  it("switch entity follows scope grant", () => {
    expect(canSwitchEntity(ownerGrants)).toBe(true);
    expect(canSwitchEntity(grantsForRole("partner"))).toBe(false);
    expect(canSwitchEntity(cashierGrants)).toBe(false);
  });
});

describe("visibleEntitiesForRole", () => {
  const entities = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];

  it("owner sees all restaurants", () => {
    expect(
      visibleEntitiesForRole(entities, "a", grantsForRole("owner")),
    ).toEqual(entities);
  });

  it("partner sees only assigned restaurant", () => {
    expect(
      visibleEntitiesForRole(entities, "a", grantsForRole("partner")),
    ).toEqual([{ id: "a", name: "A" }]);
  });
});

describe("filterDashboardKpis", () => {
  const kpis = [
    { key: "sales" as const, label: "Sales", value: "1" },
    { key: "net_result" as const, label: "Net", value: "2" },
    { key: "payables" as const, label: "Payables", value: "3" },
  ];

  it("hides financial KPIs for cashier grants", () => {
    const filtered = filterDashboardKpis(kpis, grantsForRole("cashier"));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.key).toBe("sales");
  });
});

describe("filterFinancialReportCards", () => {
  const cards = [
    { title: "KDV", financial: false },
    { title: "P&L", financial: true },
  ];

  it("cashier sees non-financial cards only", () => {
    expect(filterFinancialReportCards(cards, grantsForRole("cashier"))).toEqual([
      { title: "KDV", financial: false },
    ]);
  });
});

describe("canAccessAppPath", () => {
  it("cashier preset paths", () => {
    const grants = grantsForRole("cashier");
    expect(canAccessAppPath(grants, "/record")).toBe(true);
    expect(canAccessAppPath(grants, "/sales")).toBe(true);
    expect(canAccessAppPath(grants, "/reports")).toBe(false);
    expect(canAccessAppPath(grants, "/settings/profile")).toBe(true);
  });
});

describe("canModifyEntryDate", () => {
  const ref = new Date("2026-08-15T12:00:00Z");

  it("live month scope limits edit dates", () => {
    const grants = grantsForRole("cashier");
    expect(canModifyEntryDate(grants, "2026-08-10", ref)).toBe(true);
    expect(canModifyEntryDate(grants, "2026-07-31", ref)).toBe(false);
    expect(canModifyEntryDate(grantsForRole("owner"), "2026-07-31", ref)).toBe(
      true,
    );
  });
});

describe("filterAppRoutesForGrants", () => {
  it("filters routes by nav grants", () => {
    const routes = [{ href: "/reports" }, { href: "/record" }];
    const filtered = filterAppRoutesForGrants(routes, grantsForRole("cashier"));
    expect(filtered).toEqual([{ href: "/record" }]);
  });
});
