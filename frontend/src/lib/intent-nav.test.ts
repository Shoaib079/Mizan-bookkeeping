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
    expect(pathnameMatchesBalancesIntent("/suppliers/abc")).toBe(true);
    expect(pathnameMatchesBalancesIntent("/banking/cash")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/receipts")).toBe(true);
  });

  it("highlights collapsed sidebar rows for hidden domain routes", () => {
    expect(sidebarHrefActiveForPathname("/record", "/sales")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/staff")).toBe(true);
    expect(sidebarHrefActiveForPathname("/balances", "/banking/transfers")).toBe(
      true,
    );
  });

  it("redirects legacy uploads hub to Record", () => {
    expect(LEGACY_UPLOADS_REDIRECT).toBe("/record");
  });
});
