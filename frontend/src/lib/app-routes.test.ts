import { describe, expect, it } from "vitest";

import { appRoutes, navGroups, sidebarChildrenForNavItem } from "@/lib/app-routes";

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

  it("lists Settings sub-pages in the sidebar, not the hub link", () => {
    const settings = navGroups.find((group) => group.label === "Settings");
    expect(settings?.items.map((item) => item.href)).toEqual([
      "/settings/entity",
      "/settings/opening-balances",
      "/settings/members",
    ]);
  });

  it("assigns Sales routes to the Sales group", () => {
    const sales = navGroups.find((group) => group.label === "Sales");
    expect(sales?.items.map((item) => item.href)).toEqual([
      "/sales",
      "/close-day",
      "/cards",
      "/delivery",
    ]);
  });

  it("assigns Cards under Sales per ROADMAP", () => {
    const cards = appRoutes.find((route) => route.href === "/cards" && !route.label.startsWith("New:"));
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
  it("nests delivery children when delivery is enabled", () => {
    const children = sidebarChildrenForNavItem("/delivery", { deliveryEnabled: true });
    expect(children.map((child) => child.href)).toEqual([
      "/delivery/platforms",
      "/delivery/reports",
      "/delivery/settlements",
    ]);
  });

  it("hides delivery children when the module is off", () => {
    expect(sidebarChildrenForNavItem("/delivery", { deliveryEnabled: false })).toEqual([]);
  });

  it("nests report children regardless of delivery setting", () => {
    const children = sidebarChildrenForNavItem("/reports", { deliveryEnabled: false });
    expect(children.map((child) => child.href)).toEqual([
      "/reports/ledger",
      "/accounting/manual-journals",
    ]);
  });
});
