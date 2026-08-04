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

  it("every entity detail page composes the archetype, never its own layout", async () => {
    // Slice 2. The audit found four different arrangements of the same four
    // ingredients across these pages; the archetype is only worth having if
    // none of them goes back to hand-assembling a header or a balance card.
    const pages = [
      "../../app/staff/[id]/page.tsx",
      "../../app/(procurement)/suppliers/[id]/page.tsx",
      "../../app/(customers-section)/customers/[id]/page.tsx",
      "../../app/(customers-section)/customers/group-sales/[id]/page.tsx",
      "../../app/partners/[id]/page.tsx",
      "../banking/account-detail-page-content.tsx",
      "../banking/fx-wallet-page-content.tsx",
    ];

    for (const page of pages) {
      const source = await read(page);
      expect(source, page).toContain("<EntityDetailPage");
      // The archetype owns the title and the headline figure.
      expect(source.includes("<h1"), `${page} draws its own title`).toBe(false);
      expect(
        source.includes("text-2xl font-semibold tabular-nums"),
        `${page} draws its own headline figure`,
      ).toBe(false);
    }
  });

  it("every list page composes ListPage and pages its rows", async () => {
    // Slice 3. Rule 5: every list pages — no silent truncation. Staff and
    // partners had no pager at all, and daily sales fetched 200 rows then told
    // the reader "showing 200 — download Excel for the full list".
    const lists = [
      "../../app/staff/page.tsx",
      "../../app/(procurement)/suppliers/page.tsx",
      "../../app/(customers-section)/customers/page.tsx",
      "../../app/(customers-section)/customers/group-sales/page.tsx",
      "../../app/banking/transfers/page.tsx",
      "../../app/partners/page.tsx",
      "../group-sales/group-menus-panel.tsx",
      "../delivery/delivery-platforms-panel.tsx",
      "../review/sales-review-panel.tsx",
    ];

    for (const list of lists) {
      const source = await read(list);
      expect(source, list).toContain("<ListPage");
      // ListPage owns the breakpoint; a page forking it is how they drifted.
      expect(source.includes("useIsMobileShell"), `${list} forks mobile`).toBe(
        false,
      );
      expect(source.includes("<h1"), `${list} draws its own title`).toBe(false);
    }

    // Partners is the one list still capped rather than paged — see the note in
    // DESIGN_ARCHETYPES. Everything else offers a pager.
    for (const list of lists.filter((l) => !l.includes("partners"))) {
      const source = await read(list);
      expect(source, `${list} has no pager`).toContain("pager={{");
    }
  });

  it("row actions sit in a trailing column, weighted like siblings", async () => {
    // Edit and Void used to render inside the description cell on staff,
    // partners and supplier activity — so their left edge moved with the length
    // of the text beside them and you couldn't scan the column. Edit was also
    // filled-primary, making a long ledger a wall of blue.
    const source = await read("../ledger/subledger-row-actions.tsx");
    expect(source).not.toContain("inline");
    expect(source).toContain('variant="ghost"');
    expect(source).not.toMatch(/variant="primary"/);

    for (const page of [
      "../../app/staff/[id]/page.tsx",
      "../../app/partners/[id]/page.tsx",
      "../supplier-activity-panel.tsx",
    ]) {
      const pageSource = await read(page);
      expect(pageSource, page).toMatch(
        /<DataTableHeaderCell align="right">\s*Actions/,
      );
      expect(pageSource.includes("inline"), `${page} still inlines actions`).toBe(
        false,
      );
    }
  });

  it("FilterChips exposes counts for review queues", async () => {
    const source = await read("./filter-chips.tsx");
    expect(source).toContain("chip.count");
    expect(source).toContain("aria-pressed");
  });
});
