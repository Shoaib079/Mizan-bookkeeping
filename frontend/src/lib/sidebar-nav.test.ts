import { describe, expect, it } from "vitest";

import {
  sidebarGroupRenderMode,
  visibleNavItemsForGroup,
} from "@/lib/sidebar-nav-state";

const DELIVERY_ON = { deliveryEnabled: true };
const DELIVERY_OFF = { deliveryEnabled: false };

describe("sidebarGroupRenderMode", () => {
  it("renders a direct link when a group has exactly one visible item", () => {
    expect(sidebarGroupRenderMode("Customers", DELIVERY_ON)).toBe("link");
    expect(sidebarGroupRenderMode("Cash & bank", DELIVERY_ON)).toBe("link");
    expect(sidebarGroupRenderMode("Reports", DELIVERY_ON)).toBe("link");
    expect(sidebarGroupRenderMode("Set up", DELIVERY_ON)).toBe("link");
  });

  it("renders Sales as a direct link when delivery is off", () => {
    expect(sidebarGroupRenderMode("Sales", DELIVERY_OFF)).toBe("link");
    expect(visibleNavItemsForGroup("Sales", DELIVERY_OFF).map((item) => item.href)).toEqual([
      "/sales",
    ]);
  });

  it("renders Sales as an accordion when delivery is on", () => {
    expect(sidebarGroupRenderMode("Sales", DELIVERY_ON)).toBe("accordion");
    expect(visibleNavItemsForGroup("Sales", DELIVERY_ON).map((item) => item.href)).toEqual([
      "/sales",
      "/delivery",
    ]);
  });

  it("keeps multi-item groups as accordions", () => {
    expect(sidebarGroupRenderMode("Expenses & suppliers", DELIVERY_ON)).toBe("accordion");
    expect(sidebarGroupRenderMode("People", DELIVERY_ON)).toBe("accordion");
  });
});

describe("sidebar-nav rendering", () => {
  it("uses a direct link for single-item groups (no accordion toggle)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("items.length === 1");
    expect(source).toContain("NavRowLink");
    expect(source).toMatch(/items\.length === 1[\s\S]*NavRowLink/);
  });

  it("does not put accordion controls in the single-item branch", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    const singleBranch = source.match(/if \(items\.length === 1\) \{([\s\S]*?)\n          \}/)?.[1];
    expect(singleBranch).toBeDefined();
    expect(singleBranch).not.toContain("aria-expanded");
    expect(singleBranch).not.toContain("ChevronDown");
    expect(source).toContain("aria-expanded");
    expect(source).toContain("ChevronDown");
  });
});
