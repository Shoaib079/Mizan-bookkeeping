import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COLLAPSIBLE_NAV_GROUP_LABELS,
  navGroupContainsPathname,
  openSidebarGroupCount,
  readSidebarGroupState,
  resolveSidebarGroupState,
  SIDEBAR_NAV_STORAGE_KEY,
  sidebarGroupStateForPathname,
  toggleSidebarGroupState,
  writeSidebarGroupState,
} from "@/lib/sidebar-nav-state";

const SETTINGS = { deliveryEnabled: true };

function stubBrowserStorage() {
  const store: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
  vi.stubGlobal("window", { localStorage });
  return store;
}

describe("sidebarGroupStateForPathname", () => {
  it("opens only the group containing the current route", () => {
    expect(sidebarGroupStateForPathname("/sales", SETTINGS)).toEqual({ Sales: true });
    expect(openSidebarGroupCount(sidebarGroupStateForPathname("/sales", SETTINGS))).toBe(
      1,
    );
  });

  it("returns empty on Dashboard (pinned outside groups)", () => {
    expect(sidebarGroupStateForPathname("/", SETTINGS)).toEqual({});
  });

  it("replaces entirely on route change — never merges prior groups", () => {
    const sales = sidebarGroupStateForPathname("/sales", SETTINGS);
    const banking = sidebarGroupStateForPathname("/banking", SETTINGS);
    expect(sales).toEqual({ Sales: true });
    expect(banking).toEqual({ "Cash & bank": true });
    expect(openSidebarGroupCount({ ...sales, ...banking })).toBe(2);
    expect(openSidebarGroupCount(banking)).toBe(1);
    expect(banking.Sales).toBeUndefined();
  });
});

describe("resolveSidebarGroupState", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("auto-expands only the group containing the current route", () => {
    const state = resolveSidebarGroupState("/sales", SETTINGS, {});
    expect(state).toEqual({ Sales: true });
    expect(openSidebarGroupCount(state)).toBe(1);
  });

  it("on Dashboard restores at most one persisted open group", () => {
    const state = resolveSidebarGroupState("/", SETTINGS, { Reports: true });
    expect(state).toEqual({ Reports: true });
    expect(openSidebarGroupCount(state)).toBe(1);
  });
});

describe("toggleSidebarGroupState", () => {
  it("opens only the clicked group and closes others", () => {
    const next = toggleSidebarGroupState({ Sales: true }, "Cash & bank");
    expect(next).toEqual({ "Cash & bank": true });
    expect(openSidebarGroupCount(next)).toBe(1);
  });

  it("closes the section when clicking its open header", () => {
    expect(toggleSidebarGroupState({ Sales: true }, "Sales")).toEqual({});
  });

  it("never leaves two groups open", () => {
    let state = toggleSidebarGroupState({}, "Sales");
    state = toggleSidebarGroupState(state, "Cash & bank");
    expect(state).toEqual({ "Cash & bank": true });
    expect(state.Sales).toBeUndefined();
    expect(openSidebarGroupCount(state)).toBe(1);
  });
});

describe("navGroupContainsPathname", () => {
  it("matches delivery under Sales", () => {
    expect(navGroupContainsPathname("Sales", "/delivery/platforms", SETTINGS)).toBe(
      true,
    );
  });

  it("matches tab routes under their parent sidebar group", () => {
    expect(navGroupContainsPathname("Sales", "/cards", SETTINGS)).toBe(true);
    expect(navGroupContainsPathname("Cash & bank", "/banking/cash", SETTINGS)).toBe(true);
    expect(navGroupContainsPathname("Expenses & suppliers", "/payables", SETTINGS)).toBe(
      true,
    );
    expect(navGroupContainsPathname("Customers", "/receivables", SETTINGS)).toBe(true);
    expect(navGroupContainsPathname("Settings", "/settings/members", SETTINGS)).toBe(
      true,
    );
  });

  it("matches nested report routes under Reports", () => {
    expect(
      navGroupContainsPathname("Reports", "/reports/ledger", SETTINGS),
    ).toBe(true);
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("persists a single open group", () => {
    writeSidebarGroupState({ Sales: true });
    expect(readSidebarGroupState()).toEqual({ Sales: true });
    expect(window.localStorage.getItem(SIDEBAR_NAV_STORAGE_KEY)).toContain("Sales");
    expect(openSidebarGroupCount(readSidebarGroupState())).toBe(1);
  });

  it("survives reload via read after write", () => {
    writeSidebarGroupState({ People: true });
    expect(readSidebarGroupState()).toEqual({ People: true });
  });
});

describe("collapsible group labels", () => {
  it("excludes Overview (dashboard is pinned separately)", () => {
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).not.toContain("Overview");
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).toContain("Sales");
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).toContain("Settings");
  });
});
