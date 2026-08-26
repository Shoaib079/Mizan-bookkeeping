import { describe, expect, it } from "vitest";

import {
  activeMobileTab,
  isMobileTabRoot,
  mobileBackDestination,
  MOBILE_SHELL_MAX_WIDTH_PX,
  MOBILE_TAB_ROOTS,
  normalizePathname,
} from "@/lib/mobile-shell";

describe("mobile-shell", () => {
  it("defines five tab roots with Sales instead of Review", () => {
    expect(MOBILE_TAB_ROOTS).toEqual([
      "/",
      "/sales",
      "/record",
      "/banking",
      "/more",
    ]);
  });

  it("uses 820px breakpoint (max-width 819px)", () => {
    expect(MOBILE_SHELL_MAX_WIDTH_PX).toBe(819);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizePathname("/more/")).toBe("/more");
    expect(normalizePathname("/sales?x=1")).toBe("/sales");
  });

  it("detects tab roots vs drill-in pages", () => {
    expect(isMobileTabRoot("/")).toBe(true);
    expect(isMobileTabRoot("/record")).toBe(true);
    expect(isMobileTabRoot("/sales")).toBe(true);
    expect(isMobileTabRoot("/sales/abc")).toBe(true);
    expect(isMobileTabRoot("/banking")).toBe(true);
    expect(isMobileTabRoot("/banking/transfers")).toBe(true);
    expect(isMobileTabRoot("/banking/accounts/abc")).toBe(false);
    expect(isMobileTabRoot("/suppliers")).toBe(false);
    expect(isMobileTabRoot("/reports")).toBe(false);
    expect(isMobileTabRoot("/review")).toBe(false);
  });

  it("returns active tab for drill-in pages under their section", () => {
    expect(activeMobileTab("/sales")).toBe("/sales");
    expect(activeMobileTab("/sales/abc")).toBe("/sales");
    expect(activeMobileTab("/review")).toBe(null);
    expect(activeMobileTab("/review/bank")).toBe(null);
    expect(activeMobileTab("/banking/cash")).toBe("/banking");
    expect(activeMobileTab("/banking/accounts/x")).toBe("/banking");
    expect(activeMobileTab("/suppliers")).toBe("/more");
    expect(activeMobileTab("/reports/ledger")).toBe("/more");
  });

  it("avoids /review redirect loop when backing out of review drill-ins", () => {
    expect(mobileBackDestination("/review/bank", "/review", null)).toBe("/");
    expect(mobileBackDestination("/review/bank", "/suppliers", null)).toBe(
      "/suppliers",
    );
  });
});
