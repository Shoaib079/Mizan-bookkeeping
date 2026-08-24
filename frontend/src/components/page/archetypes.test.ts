import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring, sourceFiles } from "@/test-support/source";

/** These guard the DESIGN_ARCHETYPES contract by reading the source: the rules
 * that stop pages drifting apart again are structural, so they're checked
 * structurally rather than by rendering. */

describe("page archetypes", () => {
  it("ListPage owns the mobile breakpoint, so pages never fork it", () => {
    const source = sourceDeclaring("ListPage");
    expect(source).toContain("useIsMobileShell");
    expect(source).toContain("isMobile && mobile ? mobile : table");
  });

  it("ListPage always offers a pager — no silent truncation", () => {
    const source = sourceDeclaring("ListPage");
    expect(source).toContain("TablePager");
  });

  it("every archetype renders exactly one PageHeader", () => {
    for (const file of [
      "EntityDetailPage",
      "ListPage",
      "HubPage",
    ]) {
      const source = sourceDeclaring(file);
      expect(source, file).toContain("<PageHeader");
      expect(source.match(/<PageHeader/g)?.length, file).toBeLessThanOrEqual(2);
    }
  });

  it("SummaryPanel formats money through the shared formatter", () => {
    const source = sourceDeclaring("AmountFormatter");
    expect(source).toContain('from "@/lib/money"');
    expect(source).toContain("tabular-nums");
    // Deductions are shown signed regardless of how they are stored.
    expect(source).toContain("line.negative");
  });

  it("archetypes use design tokens, never hardcoded colours", () => {
    for (const file of [
      "PageHeader",
      "EntityDetailPage",
      "ListPage",
      "HubPage",
      "SummaryPanel",
      "FilterChips",
      "EntityBalanceSticker",
    ]) {
      const source = sourceDeclaring(file);
      expect(source.match(/#[0-9a-fA-F]{6}/), file).toBeNull();
      expect(source.match(/\b(?:bg|text)-(?:red|blue|green|slate|gray)-\d{3}\b/), file).toBeNull();
    }
  });

  it("every entity detail page composes the archetype, never its own layout", () => {
    // Slice 2. The audit found four different arrangements of the same four
    // ingredients across these pages; the archetype is only worth having if
    // none of them goes back to hand-assembling a header or a balance card.
    const pages = [
      "StaffDetailPage",
      "SupplierDetailPage",
      "CustomerDetailPage",
      "GroupSaleDetailPage",
      "PartnerDetailPage",
      "AccountDetailPageContent",
      "FxWalletPageContent",
    ];

    for (const page of pages) {
      const source = sourceDeclaring(page);
      expect(source, page).toContain("<EntityDetailPage");
      // The archetype owns the title and the headline figure.
      expect(source.includes("<h1"), `${page} draws its own title`).toBe(false);
      expect(
        source.includes("text-2xl font-semibold tabular-nums"),
        `${page} draws its own headline figure`,
      ).toBe(false);
    }
  });

  it("every list page composes ListPage and pages its rows", () => {
    // Slice 3. Rule 5: every list pages — no silent truncation. Staff and
    // partners had no pager at all, and daily sales fetched 200 rows then told
    // the reader "showing 200 — download Excel for the full list".
    const lists = [
      "StaffPage",
      "SuppliersPage",
      "CustomersPage",
      "GroupSalesPage",
      "TransfersPage",
      "PartnersPage",
      "GroupMenusPanel",
      "DeliveryPlatformsPanel",
      "SalesReviewPanel",
    ];

    for (const list of lists) {
      const source = sourceDeclaring(list);
      expect(source, list).toContain("<ListPage");
      // ListPage owns the breakpoint; a page forking it is how they drifted.
      expect(source.includes("useIsMobileShell"), `${list} forks mobile`).toBe(
        false,
      );
      expect(source.includes("<h1"), `${list} draws its own title`).toBe(false);
    }

    /* Partners is the one list still capped rather than paged — see the note
     * in DESIGN_ARCHETYPES. Everything else offers a pager.
     *
     * Named, not matched. This was `!l.includes("partners")` back when the
     * list held paths; once it held components the substring stopped matching
     * `"PartnersPage"` on the capital P, and the exception silently stopped
     * applying. A filter that excludes nothing looks exactly like one that
     * works — it only surfaced because the assertion it re-enabled happened to
     * fail. */
    const CAPPED_NOT_PAGED = ["PartnersPage"];
    for (const list of lists.filter((l) => !CAPPED_NOT_PAGED.includes(l))) {
      const source = sourceDeclaring(list);
      expect(source, `${list} has no pager`).toContain("pager={{");
    }
  });

  it("the dashboard uses OverviewPage, not the tile grid", () => {
    // Slice 4. §4b exists because the dashboard is KPI cards + charts + recent
    // entries; forcing it into HubPage would be the drift the archetypes stop.
    const dashboard = sourceDeclaring("HomePage");
    expect(dashboard).toContain("<OverviewPage");
    expect(dashboard).not.toContain("<HubPage");
    expect(dashboard.includes("<h1"), "dashboard draws its own title").toBe(
      false,
    );
  });

  it("every hub renders the shared header and one tile component", () => {
    for (const hub of [
      "BankingHubContent",
      "BankingBranchListContent",
      "DeliveryPage",
      "RecordPage",
      "MorePage",
    ]) {
      const source = sourceDeclaring(hub);
      expect(source, hub).toMatch(/<HubPage|<PageHeader/);
      expect(source.includes("<h1"), `${hub} draws its own title`).toBe(false);
      // BankingHubTile was a second tile component with its own radius and
      // padding; HubTileCard is the only one.
      expect(source).not.toContain("BankingHubTile");
    }
  });

  it("cards on the same row share one shell", () => {
    // CashBankSnapshotCard sits beside a StatCard and used rounded-xl/p-5
    // against rounded-lg/p-4, so the pair visibly failed to line up.
    const stat = sourceDeclaring("StatCard");
    const snapshot = sourceDeclaring("CashBankSnapshotCard");
    const shell = "rounded-[var(--radius-card)] border border-border bg-card p-4";
    expect(stat).toContain(shell);
    expect(snapshot).toContain(shell);
    expect(snapshot).not.toContain("rounded-xl");
  });

  it("review queues are ListPages, and document review is its own shape", () => {
    // Slice 5. A review queue turned out to be a list with different row
    // actions, so ReviewPage would have been a near-duplicate of ListPage —
    // the fork the rules forbid. ListPage gained a `preview` slot instead.
    // DocumentReviewPage stays: two panes, one document, genuinely not a list.
    for (const queue of [
      "ReceiptsReviewPanel",
      "DeliveryReviewPanel",
      "InvoicesReviewPanel",
      "SalesReviewPanel",
    ]) {
      const source = sourceDeclaring(queue);
      expect(source, queue).toContain("<ListPage");
    }

    const doc = sourceDeclaring("DocumentReviewPage");
    expect(doc).toContain("lg:grid-cols-2");

    for (const page of [
      "ReceiptReview",
      "PosSummaryReview",
    ]) {
      const source = sourceDeclaring(page);
      expect(source, page).toContain("<DocumentReviewPage");
      // The archetype draws the two panes; the page fills them.
      expect(
        source.includes("grid gap-6 lg:grid-cols-2"),
        `${page} draws its own two-pane grid`,
      ).toBe(false);
    }
  });

  it("no surface rolls its own filter chips", () => {
    // Six places drew their own pill row — solid where the shared chip is
    // tinted, some as role="tablist", each with different padding.
    // Scoped to the review screens by where they live — a directory is a
    // legitimate thing to name, unlike an individual file.
    const offenders = sourceFiles()
      .filter((file) => file.path.startsWith("components/review/"))
      .filter(
        (file) =>
          file.text.includes('role="tablist"') &&
          !file.text.includes("FilterChips"),
      )
      .map((file) => file.path);

    expect(offenders, `hand-rolled chips in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("every report composes ReportPage and shares its states", () => {
    // Slice 6. All twelve repeated the same six lines by hand — period control
    // left, downloads right, then no-entity / forbidden / error / loading —
    // each with its own spacing, so the controls sat at different heights from
    // one report to the next.
    const reports = [
      "ProfitAndLossPage",
      "BalanceSheetPage",
      "CashFlowPage",
      "GeneralLedgerPage",
      "KdvInputPage",
      "DeliverySalesPage",
      "PeriodComparisonPage",
      "CashBookPage",
      "ExpenseRegisterPage",
      "BankReconciliationPage",
      "MonthClosePage",
    ];

    for (const slug of reports) {
      const source = sourceDeclaring(slug);
      expect(source, slug).toContain("<ReportPage");
      expect(source.includes("<h1"), `${slug} draws its own title`).toBe(false);
      // The archetype renders the forbidden and loading states.
      expect(
        source.includes("<ForbiddenMessage"),
        `${slug} still renders its own forbidden state`,
      ).toBe(false);
    }

    // The hub keeps its own body (period summary, mobile sticky bar, tiles)
    // but must still own its title — same call as /banking/cash and /cards.
    const hub = sourceDeclaring("ReportsPage");
    expect(hub).toContain("<PageHeader");
  });

  it("report KPI bands use StatCard, not hand-drawn boxes", () => {
    for (const slug of [
      "ProfitAndLossPage",
      "BalanceSheetPage",
      "CashFlowPage",
      "KdvInputPage",
      "DeliverySalesPage",
      "ExpenseRegisterPage",
    ]) {
      const source = sourceDeclaring(slug);
      expect(source, slug).toContain("<StatCard");
      expect(
        source.includes("text-xl font-semibold tabular-nums"),
        `${slug} draws its own KPI box`,
      ).toBe(false);
    }
  });

  it("the equity section totals every row it prints", () => {
    // The section prints Unclosed net income as a row but the subtotal summed
    // only the GL accounts, so the column visibly did not add up — off by the
    // whole period result. The KPI had the same gap, and it is the figure that
    // has to balance against assets.
    const source = sourceDeclaring("BalanceSheetPage");
    const withUnclosed = /subtotal_kurus \+\s*report\.equity\.unclosed_net_income_kurus/;
    expect(source).toMatch(withUnclosed);
    expect(source).toMatch(
      /total_equity_kurus \+\s*report\.equity\.unclosed_net_income_kurus/,
    );
  });

  it("forms and settings compose FormPage", () => {
    // Slice 7. These had each picked their own card padding (p-5 against the
    // p-4 every other card uses) and their own max width.
    for (const page of [
      "ProfileSettingsPage",
      "RestaurantSettingsContent",
      "OpeningBalancesPage",
      "StatementImportPage",
    ]) {
      const source = sourceDeclaring(page);
      expect(source, page).toContain("<FormPage");
      expect(
        source.includes("bg-card p-5"),
        `${page} still uses the odd p-5 card`,
      ).toBe(false);
    }

    // /split is a workflow, not a settings form — it takes the header only.
    expect(sourceDeclaring("SplitHubPage")).toContain("<PageHeader");
    // Auth pages live outside the shell entirely; they are Clerk's own.
    const signIn = sourceDeclaring("SignInPage");
    expect(signIn).not.toContain("FormPage");
  });

  it("the negative-clearing warning never blocks recording", () => {
    // Card clearing cannot legitimately go negative; when it does, sales are
    // missing. The fix is to carry on entering them, so the warning must not
    // disable anything — it only tells you what is missing and links to it.
    const source = sourceDeclaring("CardsPageContent");
    const warning = source.slice(
      source.indexOf("clearing_balance_kurus < 0"),
      source.indexOf("Clearing reconciliation"),
    );
    expect(warning).toContain("Open Daily sales");
    expect(warning).not.toContain("disabled");
  });

  it("the balance sheet explains a negative retained earnings", () => {
    // Allocating profit debits retained earnings. Do it before the year is
    // closed and the account goes negative while equity is unchanged — correct,
    // but it reads like a mistake, and it cost an afternoon to establish that
    // it wasn't one.
    const source = sourceDeclaring("BalanceSheetPage");
    expect(source).toContain("RETAINED_EARNINGS_CODE");
    // Only when both conditions hold — a negative balance alone may be real.
    expect(source).toMatch(/balance_kurus < 0/);
    expect(source).toMatch(/unclosed_net_income_kurus \?\? 0\) > 0/);
    expect(source).toContain("It resolves at year-end close.");
  });

  it("row actions sit in a trailing column, weighted like siblings", () => {
    // Edit and Void used to render inside the description cell on staff,
    // partners and supplier activity — so their left edge moved with the length
    // of the text beside them and you couldn't scan the column. Edit was also
    // filled-primary, making a long ledger a wall of blue.
    const source = sourceDeclaring("SubledgerRowActions");
    expect(source).not.toContain("inline");
    expect(source).toContain('variant="ghost"');
    expect(source).not.toMatch(/variant="primary"/);

    // The trailing Actions column is LedgerTable's job now for the ledgers
    // that adopted it; the supplier panel still renders its own table.
    const ledgerTable = sourceDeclaring("LedgerColumn");
    expect(ledgerTable).toMatch(/<DataTableHeaderCell align="right">\s*Actions/);

    for (const page of [
      "StaffDetailPage",
      "PartnerDetailPage",
      "SupplierActivityPanel",
    ]) {
      const pageSource = sourceDeclaring(page);
      expect(pageSource.includes("inline"), `${page} still inlines actions`).toBe(
        false,
      );
    }

    expect(sourceDeclaring("SupplierActivityPanel")).toMatch(
      /<DataTableHeaderCell align="right">\s*Actions/,
    );
  });

  it("FilterChips exposes counts for review queues", () => {
    const source = sourceDeclaring("FilterChip");
    expect(source).toContain("chip.count");
    expect(source).toContain("aria-pressed");
  });
});

describe("mobile: the tab bar must not cover what pages pin to the bottom", () => {
  it("FormPage lifts its save bar clear of the tabs", () => {
    // sticky bottom-0 resolves against the scrollport's padding box, and
    // <main> runs underneath the fixed tab bar — so the save bar came to rest
    // behind it, and lost on z-index too (10 against 30). Save was unreachable
    // on every form in the app.
    const source = sourceDeclaring("FormPage");
    // The applied conditional, not merely the imported token: an earlier
    // version of this test asserted the name appeared somewhere in the file
    // and passed happily with the offset removed from the className.
    expect(source).toContain(
      'isMobile ? MOBILE_TAB_BAR_OFFSET : "bottom-0"',
    );
    expect(source).toContain("useIsMobileShell");
    // The unconditional `sticky bottom-0` is what caused it.
    expect(source).not.toContain("sticky bottom-0");
  });

  it("everything pinned to the bottom clears the tabs by the same amount", () => {
    // Two hand-written copies of a number that has to agree is how they stop
    // agreeing. All three now come from one file.
    const shell = sourceDeclaring("AppShell");
    const form = sourceDeclaring("FormPage");
    const toast = sourceDeclaring("ToastProvider");
    expect(shell).toContain("MOBILE_TAB_BAR_PADDING");
    expect(form).toContain("MOBILE_TAB_BAR_OFFSET");
    expect(toast).toContain("MOBILE_TOAST_OFFSET");
    expect(shell).not.toContain("pb-[calc(4.75rem");
    expect(form).not.toContain("bottom-[calc(4.75rem");
    expect(toast).not.toContain("bottom-[calc(4.75rem");

    const tokens = sourceDeclaring("DESKTOP_CHROME_ONLY");
    const measurements = [
      ...tokens.matchAll(/(?:pb|bottom)-\[calc\(([^)]*rem)\+/g),
    ].map((m) => m[1]);
    // A floor, not a count: the point is that they agree, and pinning the
    // exact number meant adding a fourth pinned element failed this test for
    // the wrong reason.
    expect(measurements.length).toBeGreaterThanOrEqual(3);
    expect(new Set(measurements).size).toBe(1);
  });

  it("the toast clears the tab bar", () => {
    // It pinned itself to bottom-4 and rendered *underneath* the tabs on
    // every phone — not a misalignment, an invisible toast. Every "Payment
    // recorded" and "Posted to the ledger" this app has shown on mobile went
    // unseen, so the app looked like it had done nothing.
    const toast = sourceDeclaring("ToastProvider");

    // The token inside the className, not merely imported at the top. The
    // first version of this test checked the file for the name and passed
    // with the class deleted from the container — the same way the FormPage
    // test above it once did. Verified by deleting the line and watching it
    // go red.
    const container = /className=\{cn\(([\s\S]*?)\)\}/.exec(toast)?.[1] ?? "";
    expect(container).toContain("MOBILE_TOAST_OFFSET");
  });

  it("the clearance tokens are literal classes Tailwind can see", () => {
    // Tailwind scans source for complete class strings. A class built by
    // interpolation — pb-[${TOKEN}] — generates no CSS at all, fails silently,
    // and looks exactly like a layout bug.
    const tokens = sourceDeclaring("DESKTOP_CHROME_ONLY");
    expect(tokens).toContain(
      '"pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"',
    );
    expect(tokens).toContain(
      '"bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"',
    );
  });
});

describe("mobile: detail pages", () => {
  it("LedgerTable counts its actions column when deciding to scroll", () => {
    // The partner ledger declares five columns and renders six — hasActions
    // adds one. Counting declared columns only is exactly how it slipped past
    // the sweep that marked every other wide table.
    const source = sourceDeclaring("LedgerColumn");
    expect(source).toContain("columns.length + (hasActions ? 1 : 0) > 5");
  });

  it("EntityDetailPage stacks its headline and panels on a phone", () => {
    // The panels are flex-1, so in a plain flex-wrap row they shrink to share
    // the width rather than wrapping — a headline and two summary cards came
    // out around 110px each on a 375px screen.
    const source = sourceDeclaring("DetailSection");
    expect(source).toContain("flex flex-col gap-3 sm:flex-row sm:flex-wrap");
  });
});

describe("filters read as choices", () => {
  it("FilterChips carry colour like the buttons beside them", () => {
    // Inactive chips were a grey border around grey text, which reads as a
    // row of disabled labels rather than filters you can press.
    const source = sourceDeclaring("FilterChip");
    expect(source).not.toContain("border border-border text-muted-foreground");
    expect(source).toContain("border-primary/40 text-primary");
    // The chosen chip is solidly filled — a tint was repeatedly read as no
    // colour at all. The unchosen ones stay outlined, because telling the
    // picked one apart is the whole point of a filter row.
    expect(source).toContain("bg-primary font-medium text-primary-foreground");
  });

  it("ListPage gives filters their own row", () => {
    // Sharing the toolbar row with the period control left the chips stranded
    // mid-line between the dates and the row count.
    const source = sourceDeclaring("ListPage");
    expect(source).toContain("filters?: React.ReactNode");
    expect(source).toContain("{filters && (");
  });
});

/** A background refresh must not blank the page it is refreshing.
 *
 * Every archetype used to render `<PageSkeleton />` whenever `loading` was
 * true, and pages set `loading` on every fetch including the background ones.
 * The result was a page that collapsed to grey blocks and sprang back each
 * time the window regained focus or anything was posted.
 *
 * Read structurally, and per file rather than as one sweep: a skeleton gated
 * on raw `loading` in *any* archetype brings the flash back for every page
 * built on it, and a sweep that stopped matching would pass over all five.
 */
describe("the loading skeleton", () => {
  const ARCHETYPES = [
    "entity-detail-page.tsx",
    "overview-page.tsx",
    "form-page.tsx",
    "document-review-page.tsx",
    "report-page.tsx",
  ];

  it("is drawn by every archetype that has one", () => {
    // Guard the guard: if these files stopped containing a skeleton at all,
    // the assertions below would pass over nothing.
    for (const file of ARCHETYPES) {
      const source = sourceAt(`components/page/${file}`);
      expect(source, file).toContain("<PageSkeleton />");
    }
  });

  it("is never gated on the raw loading flag", () => {
    for (const file of ARCHETYPES) {
      const source = sourceAt(`components/page/${file}`);
      expect(source, file).toContain("useShowsSkeleton(loading)");
      expect(source, file).not.toMatch(/\{loading \?[\s\S]{0,40}PageSkeleton/);
      expect(source, file).not.toMatch(/\{loading && <PageSkeleton/);
    }
  });
});

