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
  it("defines five tab roots", () => {
    expect(MOBILE_TAB_ROOTS).toEqual([
      "/",
      "/review",
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
    expect(normalizePathname("/review?x=1")).toBe("/review");
  });

  it("detects tab roots vs drill-in pages", () => {
    expect(isMobileTabRoot("/")).toBe(true);
    expect(isMobileTabRoot("/record")).toBe(true);
    expect(isMobileTabRoot("/banking")).toBe(true);
    expect(isMobileTabRoot("/banking/transfers")).toBe(true);
    expect(isMobileTabRoot("/banking/accounts/abc")).toBe(false);
    expect(isMobileTabRoot("/suppliers")).toBe(false);
    expect(isMobileTabRoot("/reports")).toBe(false);
  });

  it("returns active tab for drill-in pages under their section", () => {
    expect(activeMobileTab("/review")).toBe("/review");
    expect(activeMobileTab("/review/bank")).toBe("/review");
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
