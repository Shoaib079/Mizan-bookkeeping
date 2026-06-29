import { describe, expect, it } from "vitest";

import {
  LEGACY_SETUP_REDIRECTS,
  SETUP_TAB_HREFS,
} from "@/lib/setup-routes";
import {
  navSectionForPathname,
  sidebarHrefActiveForPathname,
} from "@/lib/nav-sections";

describe("setup hub navigation", () => {
  it("maps legacy settings and delivery platform URLs to setup tabs", () => {
    expect(LEGACY_SETUP_REDIRECTS["/settings"]).toBe("/setup/restaurant");
    expect(LEGACY_SETUP_REDIRECTS["/settings/entity"]).toBe("/setup/restaurant");
    expect(LEGACY_SETUP_REDIRECTS["/delivery/platforms"]).toBe(
      "/setup/delivery-platforms",
    );
    expect(LEGACY_SETUP_REDIRECTS["/accounting/manual-journals"]).toBe(
      "/setup/accountant",
    );
  });

  it("highlights Set up sidebar on hub and tab routes", () => {
    expect(sidebarHrefActiveForPathname("/setup", "/setup/members")).toBe(true);
    expect(sidebarHrefActiveForPathname("/setup", "/settings")).toBe(true);
  });

  it("resolves setup section tabs", () => {
    const section = navSectionForPathname("/setup/accountant");
    expect(section?.id).toBe("setup");
    expect(section?.tabs.find((tab) => tab.match("/setup/accountant"))?.label).toBe(
      "Accountant",
    );
  });

  it("exposes setup tab href constants", () => {
    expect(SETUP_TAB_HREFS.restaurant).toBe("/setup/restaurant");
    expect(SETUP_TAB_HREFS.accountant).toBe("/setup/accountant");
  });
});
