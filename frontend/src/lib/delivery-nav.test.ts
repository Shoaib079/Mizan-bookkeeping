import { describe, expect, it } from "vitest";

import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";
import { navSectionById } from "@/lib/nav-sections";

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
  it("defines tab links for all delivery sub-pages", () => {
    const tabs = navSectionById("delivery").tabs.map((tab) => tab.href);
    expect(tabs).toEqual([
      "/delivery",
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
    ]);
  });

  it("wraps delivery pages in a shared layout with SectionTabs", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../app/delivery/layout.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("SectionTabs");
    expect(source).toContain('sectionId="delivery"');
    expect(source).toContain("AppShell");
  });
});
