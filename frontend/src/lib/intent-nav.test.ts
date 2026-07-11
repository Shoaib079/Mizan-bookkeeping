import { describe, expect, it } from "vitest";

import {
  LEGACY_UPLOADS_REDIRECT,
  pathnameMatchesBalancesIntent,
  pathnameMatchesRecordIntent,
} from "@/lib/intent-nav";
import { sidebarHrefActiveForPathname } from "@/lib/nav-sections";

describe("intent sidebar highlighting", () => {
  it("maps legacy domain pages to Record, Balances, and Review intents", () => {
    expect(pathnameMatchesRecordIntent("/record")).toBe(true);
    expect(pathnameMatchesRecordIntent("/uploads")).toBe(true);
    // IA v2: sales/delivery paths highlight their own sidebar rows now.
    expect(pathnameMatchesRecordIntent("/sales")).toBe(false);
    expect(pathnameMatchesRecordIntent("/delivery/reports")).toBe(false);
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
    // IA v2: /sales highlights its own Sales sidebar row, not Record.
    expect(sidebarHrefActiveForPathname("/record", "/sales")).toBe(false);
    expect(sidebarHrefActiveForPathname("/sales", "/sales")).toBe(true);
    expect(sidebarHrefActiveForPathname("/sales", "/cards")).toBe(true);
    expect(sidebarHrefActiveForPathname("/sales", "/close-day")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/balances/staff")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/balances", "/payables")).toBe(true);
  });

  it("redirects legacy uploads hub to Record", () => {
    expect(LEGACY_UPLOADS_REDIRECT).toBe("/record");
  });
});
