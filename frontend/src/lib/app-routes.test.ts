import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

import {
  appRoutes,
  filterRoutesByEntitySettings,
  isNavItemActive,
  navGroups,
  sidebarChildrenForNavItem,
} from "@/lib/app-routes";

function accountMenuSurface() {
  return sourceDeclaringAll(
    "AccountMenu",
    "AccountMenuPanel",
    "useAccountMenuPanel",
    "AccountMenuDropdown",
  );
}

function commandPaletteSurface() {
  return sourceDeclaringAll(
    "CommandPalette",
    "useCommandPalette",
    "CommandPalettePanel",
    "rowBadge",
  );
}
const EXPECTED_SIDEBAR_GROUPS = [
  "Overview",
  "Money in",
  "Money out",
  "Money held",
  "Understand",
] as const;

describe("navGroups", () => {
  it("uses the IA v2 sidebar sections only", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Books")).toBe(false);
  });

  it("assigns an icon to every sidebar group", () => {
    for (const group of navGroups) {
      expect(group.icon).toBeDefined();
    }
  });

  it("shows the IA v2 sidebar groups only", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Set up")).toBe(false);
  });

  it("lists Reports and Settings under Understand in the sidebar", () => {
    const understand = navGroups.find((group) => group.label === "Understand");
    expect(understand?.items.map((item) => item.href)).toEqual([
      "/reports",
      "/settings/restaurant",
    ]);
  });

  it("keeps hub intents under Overview in sidebar order", () => {
    const overview = navGroups.find((group) => group.label === "Overview");
    expect(overview?.items.map((item) => item.href)).toEqual([
      "/",
      "/record",
      "/review",
    ]);
  });

  it("groups the money sections per IA v2", () => {
    const moneyIn = navGroups.find((group) => group.label === "Money in");
    expect(moneyIn?.items.map((item) => item.href)).toEqual([
      "/sales",
      "/delivery",
      "/customers",
    ]);
    const moneyOut = navGroups.find((group) => group.label === "Money out");
    expect(moneyOut?.items.map((item) => item.href)).toEqual([
      "/suppliers",
      "/staff",
      "/partners",
    ]);
    const moneyHeld = navGroups.find((group) => group.label === "Money held");
    expect(moneyHeld?.items.map((item) => item.href)).toEqual(["/banking"]);
  });

  it("shows Sales in the sidebar and keeps legacy/tab-only routes out (audit A1)", () => {
    const sidebarHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(sidebarHrefs).toContain("/sales");
    expect(sidebarHrefs).toContain("/settings/restaurant");
    expect(sidebarHrefs).not.toContain("/expenses");
    expect(sidebarHrefs).not.toContain("/uploads");
    expect(sidebarHrefs).not.toContain("/close-day");
    expect(sidebarHrefs).not.toContain("/cards");
    expect(sidebarHrefs).not.toContain("/onboarding/opening-balances");
    expect(sidebarHrefs).toContain("/suppliers");
    expect(sidebarHrefs).toContain("/customers");
    expect(sidebarHrefs).toContain("/staff");
    expect(sidebarHrefs).toContain("/partners");
    expect(sidebarHrefs).not.toContain("/balances");
    expect(sidebarHrefs).toContain("/banking");
    expect(sidebarHrefs).toContain("/delivery");
  });

  it("keeps every page route in appRoutes for palette indexing", () => {
    const hrefs = new Set(appRoutes.map((route) => `${route.href}::${route.label}`));
    const expected = [
      "/",
      "/record",
      "/review",
      "/sales",
      "/cards",
      "/delivery",
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
      "/review/expenses",
      "/uploads",
      "/suppliers",
      "/staff",
      "/partners",
      "/customers",
      "/banking",
      "/banking/transfers",
      "/banking/cash",
      "/reports",
      "/reports/ledger",
      "/reports/expense-register",
      "/reports/cash-book",
      "/reports/bank-reconciliation",
      "/review/manual-journals",
      "/settings/restaurant",
      "/settings/profile",
      "/onboarding/opening-balances",
      "/review/expenses?view=items",
    ];
    for (const href of expected) {
      expect([...hrefs].some((key) => key.startsWith(`${href}::`))).toBe(true);
    }
  });
});

describe("no New: routes remain after UX-A retirement", () => {
  it("has no routes with 'New:' prefix", () => {
    const newRoutes = appRoutes.filter((route) => route.label.startsWith("New:"));
    expect(newRoutes).toEqual([]);
  });

  it("has no routes with quickAction property", () => {
    const quickRoutes = appRoutes.filter((route) => "quickAction" in route);
    expect(quickRoutes).toEqual([]);
  });
});

describe("app shell header", () => {
  it("does not contain New menu or quick-action buttons", () => {
    const source = sourceDeclaring("AppShell");
    expect(source).not.toMatch(/<NewMenu/);
    expect(source).not.toContain("new-menu");
    expect(source).not.toMatch(/Daily sales/);
    expect(source).not.toMatch(/Add expense/);
    expect(source).not.toMatch(/openQuickAction\("sales"\)/);
    expect(source).not.toMatch(/openQuickAction\("expense"\)/);
  });

  it("always renders AccountMenu in the top bar (auth on and dev)", () => {
    const source = sourceDeclaring("AppShell");
    expect(source).toContain("<AccountMenu />");
    expect(source).not.toContain("UserButton");
    expect(source).not.toMatch(/authOn && <AccountMenu/);
  });

  it("keeps restaurant switching in the account menu, not the sidebar", () => {
    const source = sourceDeclaring("AppShell");
    expect(source).not.toContain("SidebarEntitySwitcher");
    expect(source).toContain("AccountMenu");
  });

  it("renders six sidebar intents as direct links", () => {
    const nav = sourceDeclaring("SidebarNav");
    expect(nav).toContain('item.href !== "/"');
    expect(nav).toContain("NavRowLink");
    expect(nav).not.toContain("aria-expanded");
  });
});

describe("account menu", () => {
  it("fetches signed-in user from entity context", () => {
    const source = sourceDeclaring("EntityProvider");
    expect(source).toContain("/users/me");
    expect(source).toContain("userProfile");
    expect(source).toContain("entitiesLoaded");
    expect(source).toContain("entitiesError");
    expect(source).toContain("fetchEntitiesWithRetry");
  });

  it("requires confirm before switching restaurants", () => {
    const source = accountMenuSurface();
    expect(source).toContain("switchConfirmMessage");
    expect(source).toContain("Switch restaurant?");
    expect(source).toContain("redirectToDashboard: true");
  });

  it("signs out via Clerk and redirects to sign-in", () => {
    const source = accountMenuSurface();
    expect(source).toContain("signOut");
    expect(source).toContain("/sign-in");
  });

  it("shows dev mode identity and hides sign-out when Clerk is off", () => {
    const source = accountMenuSurface();
    expect(source).toContain("devModeIdentityLabel");
    expect(source).toContain("AccountMenuDev");
    expect(source).toContain("Actor ID (dev)");
    expect(source).toMatch(/\{onSignOut &&/);
  });

  it("warns before switch or sign-out when unsaved work is registered", () => {
    const source = accountMenuSurface();
    expect(source).toContain("hasUnsavedWork");
    expect(source).toContain("discardChangesMessage");
  });
});

describe("entry dialogs recording context", () => {
  it("shows Recording for banner on manual expense dialog", () => {
    const source = sourceDeclaring("ManualExpenseForm");
    expect(source).toContain("RecordingForBanner");
  });
});

describe("sidebarChildrenForNavItem", () => {
  it("returns no nested sidebar children (tabs and report cards instead)", () => {
    expect(sidebarChildrenForNavItem("/reports", { deliveryEnabled: false })).toEqual([]);
  });
});

describe("intent sidebar highlighting", () => {
  it("highlights the Sales sidebar row on sales routes (IA v2)", () => {
    const sales = navGroups
      .find((group) => group.label === "Money in")
      ?.items.find((item) => item.href === "/sales");
    expect(sales).toBeDefined();
    expect(isNavItemActive("/sales", sales!)).toBe(true);
    expect(isNavItemActive("/cards", sales!)).toBe(true);
    expect(isNavItemActive("/close-day", sales!)).toBe(false);

    const record = navGroups
      .find((group) => group.label === "Overview")
      ?.items.find((item) => item.href === "/record");
    expect(record).toBeDefined();
    expect(isNavItemActive("/sales", record!)).toBe(false);
  });

  it("highlights Banking when on banking routes", () => {
    const banking = navGroups
      .find((group) => group.label === "Money held")
      ?.items.find((item) => item.href === "/banking");
    expect(banking).toBeDefined();
    expect(isNavItemActive("/banking/transfers", banking!)).toBe(true);
  });

  it("highlights Settings on any settings page", () => {
    const settings = navGroups
      .find((group) => group.label === "Understand")
      ?.items.find((item) => item.href === "/settings/restaurant");
    expect(settings).toBeDefined();
    expect(isNavItemActive("/settings/profile", settings!)).toBe(true);
  });
});

describe("delivery gating", () => {
  it("still indexes delivery palette routes when module is on", () => {
    const routes = filterRoutesByEntitySettings(appRoutes, { deliveryEnabled: true });
    expect(routes.some((route) => route.href.startsWith("/delivery"))).toBe(true);
  });

  it("removes delivery palette routes when module is off", () => {
    const routes = filterRoutesByEntitySettings(appRoutes, { deliveryEnabled: false });
    expect(routes.some((route) => route.href.startsWith("/delivery"))).toBe(false);
  });

  it("legacy uploads page redirects to Record", () => {
    const source = sourceDeclaring("UploadsRedirectPage");
    expect(source).toContain('redirect("/record")');
  });

  it("sales list links uploads to Record instead of inline modal", () => {
    // The link lives in the shared panel now that it carries the page header;
    // /sales and /review/sales render the same one.

    const panel = sourceDeclaring("SalesReviewPanel");
    expect(panel).toContain('href="/record"');
    expect(panel).not.toContain("PosSummaryUploadForm");

    const page = sourceDeclaring("SalesPage");
    expect(page).not.toContain("PosSummaryUploadForm");
  });
});

describe("command palette (UX-B data-first search)", () => {
  it("searches suppliers, expense items, pages, and actions", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("searchSuppliers");
    expect(source).toContain("searchExpenseItems");
    expect(source).toContain("appRoutes");
    expect(source).toContain("RECORD_ACTIONS");
  });

  it("has debounce + stale entity guard", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("PALETTE_SEARCH_DEBOUNCE_MS");
    expect(source).toContain("nextSearchGeneration");
    expect(source).toContain("isStale");
    expect(source).toContain("prevEntityRef");
  });

  it("gates actions behind canWriteDailyTransactions", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("canWriteDailyTransactions(grants)");
    expect(source).toContain("filterRecordActions");
  });

  it("navigates to supplier detail on supplier select", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("router.push(`/suppliers/${row.supplier.id}`)");
  });

  it("opens action via openRecordAction on action select", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("openRecordAction(row.action.id)");
  });

  it("shows spend totals in subtitle slot (SRCH-B)", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("supplierSpend");
    expect(source).toContain("itemSpend");
    expect(source).toContain("formatTry(spend)");
    expect(source).toContain("reports/time-series");
  });

  it("fetches spend data on palette open", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("spend_by_supplier");
    expect(source).toContain("expenses_by_item");
    expect(source).toContain("currentMonthRange");
  });

  it("builds spend lookup maps from time-series response", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("new Map(ts.spend_by_supplier");
    expect(source).toContain("new Map(ts.expenses_by_item");
  });

  it("falls back to type label when no spend data", () => {
    const source = commandPaletteSurface();
    expect(source).toContain('spend ? formatTry(spend) : "Supplier"');
    expect(source).toContain('spend ? formatTry(spend) : "Item"');
  });

  it("filters hidden actions from palette action list", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("!a.hidden");
  });

  it("routes item click to filtered review expenses", () => {
    const source = commandPaletteSurface();
    expect(source).toContain("reviewExpensesFilteredHref");
  });
});

describe("top-bar Record button", () => {
  it("renders a + Record link to /record gated by shouldShowNewMenu", () => {
    const source = sourceDeclaring("AppShell");
    expect(source).toContain("shouldShowNewMenu(grants)");
    expect(source).toContain('href="/record"');
    expect(source).toContain("Plus");
    expect(source).toContain("bg-primary");
    expect(source).toMatch(/Plus[\s\S]*Record/);
  });
});
