import { describe, expect, it } from "vitest";

import {
  LEGACY_UPLOADS_REDIRECT,
  pathnameMatchesBalancesIntent,
  pathnameMatchesRecordIntent,
} from "@/lib/intent-nav";
import { sidebarHrefActiveForPathname } from "@/lib/nav-sections";

describe("intent sidebar highlighting", () => {
  it("maps legacy domain pages to Record, Balances, and Review intents", () => {
    expect(pathnameMatchesRecordIntent("/sales")).toBe(true);
    expect(pathnameMatchesRecordIntent("/delivery/reports")).toBe(true);
    expect(pathnameMatchesBalancesIntent("/banking/cash")).toBe(false);
    expect(pathnameMatchesBalancesIntent("/banking")).toBe(false);
    expect(pathnameMatchesBalancesIntent("/customers/abc")).toBe(false);
    expect(pathnameMatchesBalancesIntent("/staff")).toBe(false);
    expect(pathnameMatchesBalancesIntent("/balances/staff")).toBe(true);
    expect(sidebarHrefActiveForPathname("/suppliers", "/suppliers")).toBe(true);
    expect(sidebarHrefActiveForPathname("/customers", "/customers")).toBe(true);
    expect(sidebarHrefActiveForPathname("/staff", "/staff")).toBe(true);
    expect(sidebarHrefActiveForPathname("/partners", "/partners")).toBe(true);
    expect(sidebarHrefActiveForPathname("/banking", "/banking/transfers")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/balances", "/suppliers")).toBe(false);
    expect(sidebarHrefActiveForPathname("/balances", "/customers")).toBe(false);
    expect(sidebarHrefActiveForPathname("/review", "/review/receipts")).toBe(true);
  });

  it("highlights collapsed sidebar rows for hidden domain routes", () => {
    expect(sidebarHrefActiveForPathname("/record", "/sales")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/balances/staff")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/balances", "/payables")).toBe(true);
  });

  it("redirects legacy uploads hub to Record", () => {
    expect(LEGACY_UPLOADS_REDIRECT).toBe("/record");
  });
});
