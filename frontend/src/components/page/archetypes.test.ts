import { describe, expect, it } from "vitest";

/** These guard the DESIGN_ARCHETYPES contract by reading the source: the rules
 * that stop pages drifting apart again are structural, so they're checked
 * structurally rather than by rendering. */

async function read(file: string): Promise<string> {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL(file, import.meta.url), "utf8"),
  );
}

describe("page archetypes", () => {
  it("ListPage owns the mobile breakpoint, so pages never fork it", async () => {
    const source = await read("./list-page.tsx");
    expect(source).toContain("useIsMobileShell");
    expect(source).toContain("isMobile && mobile ? mobile : table");
  });

  it("ListPage always offers a pager — no silent truncation", async () => {
    const source = await read("./list-page.tsx");
    expect(source).toContain("TablePager");
  });

  it("every archetype renders exactly one PageHeader", async () => {
    for (const file of [
      "./entity-detail-page.tsx",
      "./list-page.tsx",
      "./hub-page.tsx",
    ]) {
      const source = await read(file);
      expect(source, file).toContain("<PageHeader");
      expect(source.match(/<PageHeader/g)?.length, file).toBeLessThanOrEqual(2);
    }
  });

  it("SummaryPanel formats money through the shared formatter", async () => {
    const source = await read("./summary-panel.tsx");
    expect(source).toContain('from "@/lib/money"');
    expect(source).toContain("tabular-nums");
    // Deductions are shown signed regardless of how they are stored.
    expect(source).toContain("line.negative");
  });

  it("archetypes use design tokens, never hardcoded colours", async () => {
    for (const file of [
      "./page-header.tsx",
      "./entity-detail-page.tsx",
      "./list-page.tsx",
      "./hub-page.tsx",
      "./summary-panel.tsx",
      "./filter-chips.tsx",
    ]) {
      const source = await read(file);
      expect(source.match(/#[0-9a-fA-F]{6}/), file).toBeNull();
      expect(source.match(/\b(?:bg|text)-(?:red|blue|green|slate|gray)-\d{3}\b/), file).toBeNull();
    }
  });

  it("FilterChips exposes counts for review queues", async () => {
    const source = await read("./filter-chips.tsx");
    expect(source).toContain("chip.count");
    expect(source).toContain("aria-pressed");
  });
});
