import { describe, expect, it } from "vitest";

import {
  appRoutes,
  filterNavItemsByEntitySettings,
  filterRoutesByEntitySettings,
  isNavItemActive,
  navGroups,
  sidebarChildrenForNavItem,
} from "@/lib/app-routes";
import { NEW_COMMAND_QUICK_ACTIONS } from "@/lib/nav-sections";

const EXPECTED_SIDEBAR_GROUPS = [
  "Overview",
  "Sales",
  "Expenses & suppliers",
  "People",
  "Customers",
  "Cash & bank",
  "Reports",
  "Settings",
] as const;

const NON_NEW_ROUTES = appRoutes.filter((route) => !route.label.startsWith("New:"));

describe("navGroups", () => {
  it("uses plain-language sidebar sections instead of Books", () => {
    expect(navGroups.map((group) => group.label)).toEqual([...EXPECTED_SIDEBAR_GROUPS]);
    expect(navGroups.some((group) => group.label === "Books")).toBe(false);
  });

  it("assigns an icon to every sidebar group", () => {
    for (const group of navGroups) {
      expect(group.icon).toBeDefined();
    }
  });

  it("shows a single Settings hub row instead of sub-page rows", () => {
    const settings = navGroups.find((group) => group.label === "Settings");
    expect(settings?.items.map((item) => item.href)).toEqual(["/settings"]);
  });

  it("consolidates Sales to sidebar entry points only (tabs for sub-pages)", () => {
    const sales = navGroups.find((group) => group.label === "Sales");
    expect(sales?.items.map((item) => item.href)).toEqual(["/sales", "/delivery"]);
  });

  it("renames Uploads to Documents in the sidebar", () => {
    const expenses = navGroups.find((group) => group.label === "Expenses & suppliers");
    const documents = expenses?.items.find((item) => item.href === "/uploads");
    expect(documents?.label).toBe("Documents");
  });

  it("hides tab-only and report-card routes from sidebar rows", () => {
    const sidebarHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(sidebarHrefs).not.toContain("/cards");
    expect(sidebarHrefs).not.toContain("/close-day");
    expect(sidebarHrefs).not.toContain("/payables");
    expect(sidebarHrefs).not.toContain("/receivables");
    expect(sidebarHrefs).not.toContain("/banking/transfers");
    expect(sidebarHrefs).not.toContain("/banking/cash");
    expect(sidebarHrefs).not.toContain("/reports/ledger");
    expect(sidebarHrefs).not.toContain("/accounting/manual-journals");
    expect(sidebarHrefs).not.toContain("/settings/entity");
  });

  it("assigns Cards under Sales in appRoutes (palette indexing)", () => {
    const cards = appRoutes.find(
      (route) => route.href === "/cards" && !route.label.startsWith("New:"),
    );
    expect(cards?.group).toBe("Sales");
  });

  it("keeps every non-New route in appRoutes", () => {
    const hrefs = new Set(NON_NEW_ROUTES.map((route) => `${route.href}::${route.label}`));
    const expected = [
      "/",
      "/sales",
      "/close-day",
      "/cards",
      "/delivery",
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
      "/expenses",
      "/uploads",
      "/suppliers",
      "/payables",
      "/staff",
      "/partners",
      "/customers",
      "/receivables",
      "/banking",
      "/banking/transfers",
      "/banking/cash",
      "/reports",
      "/reports/ledger",
      "/accounting/manual-journals",
      "/settings",
      "/settings/entity",
      "/settings/opening-balances",
      "/settings/members",
    ];
    for (const href of expected) {
      expect([...hrefs].some((key) => key.startsWith(`${href}::`))).toBe(true);
    }
  });
});

describe("New menu command palette routes", () => {
  const newRoutes = appRoutes.filter((route) => route.label.startsWith("New:"));

  it("omits Cash tip and Card sales batch shortcuts", () => {
    const labels = newRoutes.map((route) => route.label);
    expect(labels).not.toContain("New: Cash tip");
    expect(labels).not.toContain("New: Card sales batch");
  });

  it("uses quickAction for modal New: entries (matching the New menu)", () => {
    for (const [label, key] of Object.entries(NEW_COMMAND_QUICK_ACTIONS)) {
      const route = newRoutes.find((entry) => entry.label === label);
      expect(route?.quickAction).toBe(key);
    }
  });
});

describe("app shell header", () => {
  it("does not export top-bar quick-action button labels", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
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

  it("uses collapsible sidebar sections with pinned dashboard", async () => {
    const shell = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/app-shell.tsx", import.meta.url),
        "utf8",
      ),
    );
    const nav = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/layout/sidebar-nav.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(shell).toContain("<SidebarNav");
    expect(nav).toContain("aria-expanded");
    expect(nav).toContain("rotate-180");
    expect(nav).toContain('item.href === "/"');
    expect(nav).toMatch(/group\.icon/);
    expect(nav).toContain("items.length === 1");
    expect(nav).toContain("NavRowLink");
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
    expect(sidebarChildrenForNavItem("/delivery", { deliveryEnabled: true })).toEqual([]);
    expect(sidebarChildrenForNavItem("/reports", { deliveryEnabled: false })).toEqual([]);
    expect(sidebarChildrenForNavItem("/settings", { deliveryEnabled: true })).toEqual([]);
  });
});

describe("tab routes expand sidebar parent groups", () => {
  it("opens Sales when on /cards", () => {
    const sales = navGroups
      .find((group) => group.label === "Sales")
      ?.items.find((item) => item.href === "/sales");
    expect(sales).toBeDefined();
    expect(isNavItemActive("/cards", sales!)).toBe(true);
  });

  it("opens Cash & bank when on /banking/transfers", () => {
    const banking = navGroups
      .find((group) => group.label === "Cash & bank")
      ?.items.find((item) => item.href === "/banking");
    expect(banking).toBeDefined();
    expect(isNavItemActive("/banking/transfers", banking!)).toBe(true);
  });
});

describe("delivery gating", () => {
  it("hides delivery sidebar row when module is off", () => {
    const sales = navGroups.find((group) => group.label === "Sales");
    const items = filterNavItemsByEntitySettings(sales!.items, { deliveryEnabled: false });
    expect(items.map((item) => item.href)).toEqual(["/sales"]);
  });

  it("removes delivery palette routes when module is off", () => {
    const routes = filterRoutesByEntitySettings(appRoutes, { deliveryEnabled: false });
    expect(routes.some((route) => route.href.startsWith("/delivery"))).toBe(false);
  });

  it("settings hub has no delivery platforms card", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../app/settings/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toContain("/delivery/platforms");
    expect(source).not.toContain("Delivery platforms");
  });
});

describe("command palette quick actions", () => {
  it("opens modals for quickAction routes instead of navigating", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/command-palette.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("route.quickAction");
    expect(source).toContain("openQuickAction(route.quickAction)");
  });
});
