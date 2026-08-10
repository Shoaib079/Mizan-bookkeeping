import { describe, expect, it } from "vitest";

import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";
import { navSectionById } from "@/lib/nav-sections";
import { sourceDeclaring } from "@/test-support/source";

describe("command palette routes", () => {
  it("still indexes every delivery sub-route", () => {
    const routes = filterRoutesByEntitySettings(appRoutes, { deliveryEnabled: true });
    const hrefs = routes.map((route) => route.href);
    expect(hrefs).toContain("/delivery");
    expect(hrefs).toContain("/delivery/platforms");
    expect(hrefs).toContain("/delivery/reports");
    expect(hrefs).toContain("/delivery/settlements");
  });
});

describe("delivery tabs", () => {
  it("defines tab links for delivery sub-pages including platforms", () => {
    const tabs = navSectionById("delivery").tabs.map((tab) => tab.href);
    expect(tabs).toEqual([
      "/delivery",
      "/delivery/reports",
      "/delivery/settlements",
      "/delivery/platforms",
    ]);
  });

  it("wraps delivery pages in a shared layout with SectionTabs", () => {
    const source = sourceDeclaring("DeliveryLayout");
    expect(source).toContain("SectionTabs");
    expect(source).toContain('sectionId="delivery"');
    expect(source).toContain("AppShell");
  });
});
