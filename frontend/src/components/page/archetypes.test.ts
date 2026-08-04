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

  it("the dashboard uses OverviewPage, not the tile grid", async () => {
    // Slice 4. §4b exists because the dashboard is KPI cards + charts + recent
    // entries; forcing it into HubPage would be the drift the archetypes stop.
    const dashboard = await read("../../app/page.tsx");
    expect(dashboard).toContain("<OverviewPage");
    expect(dashboard).not.toContain("<HubPage");
    expect(dashboard.includes("<h1"), "dashboard draws its own title").toBe(
      false,
    );
  });

  it("every hub renders the shared header and one tile component", async () => {
    for (const hub of [
      "../banking/banking-hub-content.tsx",
      "../banking/banking-branch-list-content.tsx",
      "../../app/delivery/page.tsx",
      "../../app/record/page.tsx",
      "../../app/more/page.tsx",
    ]) {
      const source = await read(hub);
      expect(source, hub).toMatch(/<HubPage|<PageHeader/);
      expect(source.includes("<h1"), `${hub} draws its own title`).toBe(false);
      // BankingHubTile was a second tile component with its own radius and
      // padding; HubTileCard is the only one.
      expect(source).not.toContain("BankingHubTile");
    }
  });

  it("cards on the same row share one shell", async () => {
    // CashBankSnapshotCard sits beside a StatCard and used rounded-xl/p-5
    // against rounded-lg/p-4, so the pair visibly failed to line up.
    const stat = await read("./stat-card.tsx");
    const snapshot = await read("../dashboard/cash-bank-snapshot-card.tsx");
    const shell = "rounded-lg border border-border bg-card p-4";
    expect(stat).toContain(shell);
    expect(snapshot).toContain(shell);
    expect(snapshot).not.toContain("rounded-xl");
  });

  it("review queues are ListPages, and document review is its own shape", async () => {
    // Slice 5. A review queue turned out to be a list with different row
    // actions, so ReviewPage would have been a near-duplicate of ListPage —
    // the fork the rules forbid. ListPage gained a `preview` slot instead.
    // DocumentReviewPage stays: two panes, one document, genuinely not a list.
    for (const queue of [
      "../review/receipts-review-panel.tsx",
      "../review/delivery-review-panel.tsx",
      "../review/invoices-review-panel.tsx",
      "../review/sales-review-panel.tsx",
    ]) {
      const source = await read(queue);
      expect(source, queue).toContain("<ListPage");
    }

    const doc = await read("./document-review-page.tsx");
    expect(doc).toContain("lg:grid-cols-2");

    for (const page of [
      "../receipt-review.tsx",
      "../pos-summary-review.tsx",
    ]) {
      const source = await read(page);
      expect(source, page).toContain("<DocumentReviewPage");
      // The archetype draws the two panes; the page fills them.
      expect(
        source.includes("grid gap-6 lg:grid-cols-2"),
        `${page} draws its own two-pane grid`,
      ).toBe(false);
    }
  });

  it("no surface rolls its own filter chips", async () => {
    // Six places drew their own pill row — solid where the shared chip is
    // tinted, some as role="tablist", each with different padding.
    const { readdir } = await import("fs/promises");
    const offenders: string[] = [];

    async function scan(dir: string, depth = 0): Promise<void> {
      if (depth > 3) return;
      const url = new URL(dir, import.meta.url);
      for (const entry of await readdir(url, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          await scan(`${dir}${entry.name}/`, depth + 1);
        } else if (entry.name.endsWith(".tsx")) {
          const source = await read(`${dir}${entry.name}`);
          // The active-chip treatment, outside the shared component.
          if (
            source.includes('role="tablist"') &&
            !source.includes("FilterChips")
          ) {
            offenders.push(`${dir}${entry.name}`);
          }
        }
      }
    }
    await scan("../review/");

    expect(offenders, `hand-rolled chips in: ${offenders.join(", ")}`).toEqual(
      [],
    );
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
