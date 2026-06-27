import { describe, expect, it } from "vitest";

import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";

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
  it("defines tab links for all delivery sub-pages", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/delivery/delivery-tabs.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("/delivery/platforms");
    expect(source).toContain("/delivery/reports");
    expect(source).toContain("/delivery/settlements");
    expect(source).toContain('role="tablist"');
  });

  it("wraps delivery pages in a shared layout with tabs", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../app/delivery/layout.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("DeliveryTabs");
    expect(source).toContain("AppShell");
  });
});
