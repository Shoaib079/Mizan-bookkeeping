import { describe, expect, it } from "vitest";

import {
  sidebarGroupRenderMode,
  visibleNavItemsForGroup,
} from "@/lib/sidebar-nav-state";

const DELIVERY_ON = { deliveryEnabled: true };

describe("sidebarGroupRenderMode", () => {
  it("renders Reports as an accordion when opening balances is listed", () => {
    expect(sidebarGroupRenderMode("Reports", DELIVERY_ON)).toBe("accordion");
  });

  it("does not expose removed domain groups", () => {
    expect(visibleNavItemsForGroup("Sales", DELIVERY_ON)).toEqual([]);
    expect(visibleNavItemsForGroup("People", DELIVERY_ON)).toEqual([]);
  });
});

describe("sidebar-nav rendering", () => {
  it("renders overview hub intents as direct links below Dashboard", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('item.href !== "/"');
    expect(source).toContain("hubItems.map");
    expect(source).toContain("NavRowLink");
  });

  it("renders nested rows under Reports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("border-l border-border pl-2");
    expect(source).toContain("...children");
  });

  it("does not render accordion controls after UX6 collapse", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toContain("aria-expanded");
    expect(source).not.toContain("ChevronDown");
  });
});
