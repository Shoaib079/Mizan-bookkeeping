import { describe, expect, it } from "vitest";

import { navGroups } from "@/lib/app-routes";

describe("sidebar-nav rendering (IA v2)", () => {
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

  it("renders labelled flat groups — no nesting, no accordion controls", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("{group.label}");
    expect(source).not.toContain("aria-expanded");
    expect(source).not.toContain("ChevronDown");
    expect(source).not.toContain("...children");
  });

  it("exposes every non-Overview group with at least one item", () => {
    for (const group of navGroups.filter((g) => g.label !== "Overview")) {
      expect(group.items.length, group.label).toBeGreaterThan(0);
    }
  });
});
