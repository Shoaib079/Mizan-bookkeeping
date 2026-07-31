import { describe, expect, it } from "vitest";

import {
  LEGACY_UPLOADS_REDIRECT,
  pathnameMatchesRecordIntent,
} from "@/lib/intent-nav";
import { sidebarHrefActiveForPathname } from "@/lib/nav-sections";

describe("intent sidebar highlighting", () => {
  it("maps legacy domain pages to Record and directory sidebar rows", () => {
    expect(pathnameMatchesRecordIntent("/record")).toBe(true);
    expect(pathnameMatchesRecordIntent("/uploads")).toBe(true);
    expect(pathnameMatchesRecordIntent("/sales")).toBe(false);
    expect(pathnameMatchesRecordIntent("/delivery/reports")).toBe(false);
    expect(sidebarHrefActiveForPathname("/suppliers", "/suppliers")).toBe(true);
    expect(sidebarHrefActiveForPathname("/customers", "/customers")).toBe(true);
    expect(sidebarHrefActiveForPathname("/staff", "/staff")).toBe(true);
    expect(sidebarHrefActiveForPathname("/partners", "/partners")).toBe(true);
    expect(sidebarHrefActiveForPathname("/banking", "/banking/transfers")).toBe(
      true,
    );
    expect(sidebarHrefActiveForPathname("/", "/balances")).toBe(true);
    expect(sidebarHrefActiveForPathname("/review", "/review/receipts")).toBe(true);
  });

  it("highlights collapsed sidebar rows for hidden domain routes", () => {
    expect(sidebarHrefActiveForPathname("/record", "/sales")).toBe(false);
    expect(sidebarHrefActiveForPathname("/sales", "/sales")).toBe(true);
    expect(sidebarHrefActiveForPathname("/sales", "/cards")).toBe(true);
    expect(sidebarHrefActiveForPathname("/sales", "/close-day")).toBe(false);
    expect(sidebarHrefActiveForPathname("/suppliers", "/payables")).toBe(true);
    expect(sidebarHrefActiveForPathname("/customers", "/receivables")).toBe(true);
  });

  it("redirects legacy uploads hub to Record", () => {
    expect(LEGACY_UPLOADS_REDIRECT).toBe("/record");
  });
});
