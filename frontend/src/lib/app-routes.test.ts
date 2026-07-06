import { describe, expect, it } from "vitest";

import {
  appRoutes,
  filterRoutesByEntitySettings,
  isNavItemActive,
  navGroups,
  sidebarChildrenForNavItem,
} from "@/lib/app-routes";
const EXPECTED_SIDEBAR_GROUPS = ["Overview", "Reports"] as const;

describe("navGroups", () => {
  it("uses six-intent sidebar sections only", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Sales")).toBe(false);
    expect(navGroups.some((group) => group.label === "Books")).toBe(false);
  });

  it("assigns an icon to every sidebar group", () => {
    for (const group of navGroups) {
      expect(group.icon).toBeDefined();
    }
  });

  it("shows Overview and Reports sidebar groups only", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Set up")).toBe(false);
  });

  it("keeps hub intents under Overview in sidebar order", () => {
    const overview = navGroups.find((group) => group.label === "Overview");
    expect(overview?.items.map((item) => item.href)).toEqual([
      "/",
      "/record",
      "/review",
      "/balances",
      "/suppliers",
      "/customers",
      "/staff",
      "/partners",
      "/banking",
      "/delivery",
    ]);
  });

  it("hides collapsed domain routes from sidebar rows", () => {
    const sidebarHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(sidebarHrefs).not.toContain("/sales");
    expect(sidebarHrefs).not.toContain("/expenses");
    expect(sidebarHrefs).not.toContain("/uploads");
    expect(sidebarHrefs).toContain("/suppliers");
    expect(sidebarHrefs).toContain("/customers");
    expect(sidebarHrefs).toContain("/staff");
    expect(sidebarHrefs).toContain("/partners");
    expect(sidebarHrefs).toContain("/banking");
    expect(sidebarHrefs).toContain("/delivery");
    expect(sidebarHrefs).not.toContain("/settings/restaurant");
  });

  it("keeps every page route in appRoutes for palette indexing", () => {
    const hrefs = new Set(appRoutes.map((route) => `${route.href}::${route.label}`));
    const expected = [
      "/",
      "/record",
      "/balances",
      "/review",
      "/sales",
      "/close-day",
      "/cards",
      "/delivery",
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
      "/review/expenses",
      "/uploads",
      "/suppliers",
      "/balances/suppliers",
      "/staff",
      "/partners",
      "/customers",
      "/balances/customers",
      "/banking",
      "/banking/transfers",
      "/banking/cash",
      "/reports",
      "/reports/ledger",
      "/review/manual-journals",
      "/settings/restaurant",
      "/settings/profile",
      "/onboarding/opening-balances",
      "/expenses/items",
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
  it("does not contain New menu or quick-action buttons", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toMatch(/<NewMenu/);
    expect(source).not.toContain("new-menu");
    expect(source).not.toMatch(/Daily sales/);
    expect(source).not.toMatch(/Add expense/);
    expect(source).not.toMatch(/openQuickAction\("sales"\)/);
    expect(source).not.toMatch(/openQuickAction\("expense"\)/);
  });

  it("always renders AccountMenu in the top bar (auth on and dev)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("<AccountMenu />");
    expect(source).not.toContain("UserButton");
    expect(source).not.toMatch(/authOn && <AccountMenu/);
  });

  it("shows sidebar restaurant badge only — no sidebar switcher in any mode", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("Use the account menu to switch");
    expect(source).toContain("EntityBadge");
    expect(source).not.toContain("Combobox");
    expect(source).not.toContain("entity-select");
    expect(source).not.toContain("actor-id");
  });

  it("renders six sidebar intents as direct links", async () => {
    const nav = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(nav).toContain('item.href !== "/"');
    expect(nav).toContain("NavRowLink");
    expect(nav).not.toContain("aria-expanded");
  });
});

describe("account menu", () => {
  it("fetches signed-in user from entity context", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../lib/entity-context.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("/users/me");
    expect(source).toContain("userProfile");
    expect(source).toContain("entitiesLoaded");
    expect(source).toContain("entitiesError");
    expect(source).toContain("fetchEntitiesWithRetry");
  });

  it("requires confirm before switching restaurants", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/account-menu.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("switchConfirmMessage");
    expect(source).toContain("Switch restaurant?");
    expect(source).toContain("redirectToDashboard: true");
  });

  it("signs out via Clerk and redirects to sign-in", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/account-menu.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("signOut");
    expect(source).toContain("/sign-in");
  });

  it("shows dev mode identity and hides sign-out when Clerk is off", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/account-menu.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("devModeIdentityLabel");
    expect(source).toContain("AccountMenuDev");
    expect(source).toContain("Actor ID (dev)");
    expect(source).toMatch(/\{onSignOut &&/);
  });

  it("warns before switch or sign-out when unsaved work is registered", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/account-menu.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("hasUnsavedWork");
    expect(source).toContain("unsavedWorkWarningMessage");
  });
});

describe("entry dialogs recording context", () => {
  it("shows Recording for banner on manual expense dialog", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/forms/manual-expense-form.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("RecordingForBanner");
  });
});

describe("sidebarChildrenForNavItem", () => {
  it("returns no nested sidebar children (tabs and report cards instead)", () => {
    expect(sidebarChildrenForNavItem("/reports", { deliveryEnabled: false })).toEqual([]);
  });
});

describe("intent sidebar highlighting", () => {
  it("highlights Add when on legacy sales routes", () => {
    const record = navGroups
      .find((group) => group.label === "Overview")
      ?.items.find((item) => item.href === "/record");
    expect(record).toBeDefined();
    expect(isNavItemActive("/sales", record!)).toBe(true);
  });

  it("highlights Banking when on banking routes", () => {
    const banking = navGroups
      .find((group) => group.label === "Overview")
      ?.items.find((item) => item.href === "/banking");
    expect(banking).toBeDefined();
    expect(isNavItemActive("/banking/transfers", banking!)).toBe(true);
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

  it("legacy uploads page redirects to Record", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../app/uploads/page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('redirect("/record")');
  });

  it("sales list links uploads to Record instead of inline modal", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../app/(sales)/sales/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('href="/record"');
    expect(source).not.toContain("PosSummaryUploadForm");
  });
});

describe("command palette (UX-B data-first search)", () => {
  it("searches suppliers, expense items, pages, and actions", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("searchSuppliers");
    expect(source).toContain("searchExpenseItems");
    expect(source).toContain("appRoutes");
    expect(source).toContain("RECORD_ACTIONS");
  });

  it("has debounce + stale entity guard", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("PALETTE_SEARCH_DEBOUNCE_MS");
    expect(source).toContain("nextSearchGeneration");
    expect(source).toContain("isStale");
    expect(source).toContain("prevEntityRef");
  });

  it("gates actions behind canWriteOperations", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("canWriteOperations(role)");
    expect(source).toContain("filterRecordActions");
  });

  it("navigates to supplier detail on supplier select", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("router.push(`/suppliers/${row.supplier.id}`)");
  });

  it("opens action via openRecordAction on action select", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("openRecordAction(row.action.id)");
  });

  it("shows spend totals in subtitle slot (SRCH-B)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("supplierSpend");
    expect(source).toContain("itemSpend");
    expect(source).toContain("formatTry(spend)");
    expect(source).toContain("reports/time-series");
  });

  it("fetches spend data on palette open", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("spend_by_supplier");
    expect(source).toContain("expenses_by_item");
    expect(source).toContain("currentMonthRange");
  });

  it("builds spend lookup maps from time-series response", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("new Map(ts.spend_by_supplier");
    expect(source).toContain("new Map(ts.expenses_by_item");
  });

  it("falls back to type label when no spend data", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('spend ? formatTry(spend) : "Supplier"');
    expect(source).toContain('spend ? formatTry(spend) : "Item"');
  });

  it("filters hidden actions from palette action list", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("!a.hidden");
  });

  it("routes item click to /expenses/items#item-{id}", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("/expenses/items#item-${row.item.id}");
  });
});

describe("top-bar Add button", () => {
  it("renders a + Add link to /record gated by shouldShowNewMenu", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("shouldShowNewMenu(role)");
    expect(source).toContain('href="/record"');
    expect(source).toContain("Plus");
    expect(source).toContain("bg-primary");
    expect(source).toMatch(/Plus[\s\S]*Add/);
  });
});
