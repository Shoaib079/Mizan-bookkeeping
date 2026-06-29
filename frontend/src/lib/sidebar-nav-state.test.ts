import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COLLAPSIBLE_NAV_GROUP_LABELS,
  navGroupContainsPathname,
  openSidebarGroupCount,
  readSidebarGroupState,
  resolveSidebarGroupState,
  SIDEBAR_NAV_STORAGE_KEY,
  sidebarGroupRenderMode,
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

  it("returns empty for direct-link groups (single visible item)", () => {
    expect(sidebarGroupStateForPathname("/banking", SETTINGS)).toEqual({});
    expect(sidebarGroupStateForPathname("/customers", SETTINGS)).toEqual({});
    expect(sidebarGroupStateForPathname("/reports", SETTINGS)).toEqual({});
    expect(sidebarGroupStateForPathname("/settings", SETTINGS)).toEqual({});
  });

  it("returns empty for Sales when delivery is off (direct link)", () => {
    expect(sidebarGroupStateForPathname("/sales", { deliveryEnabled: false })).toEqual({});
  });

  it("replaces entirely on route change — never merges prior groups", () => {
    const sales = sidebarGroupStateForPathname("/sales", SETTINGS);
    const expenses = sidebarGroupStateForPathname("/expenses", SETTINGS);
    expect(sales).toEqual({ Sales: true });
    expect(expenses).toEqual({ "Expenses & suppliers": true });
    expect(openSidebarGroupCount({ ...sales, ...expenses })).toBe(2);
    expect(openSidebarGroupCount(expenses)).toBe(1);
    expect(expenses.Sales).toBeUndefined();
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

  it("on Dashboard restores at most one persisted accordion group", () => {
    const state = resolveSidebarGroupState("/", SETTINGS, { People: true });
    expect(state).toEqual({ People: true });
    expect(openSidebarGroupCount(state)).toBe(1);
  });

  it("ignores persisted state for direct-link groups on Dashboard", () => {
    expect(resolveSidebarGroupState("/", SETTINGS, { Reports: true })).toEqual({});
    expect(resolveSidebarGroupState("/", SETTINGS, { Customers: true })).toEqual({});
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
    expect(navGroupContainsPathname("Overview", "/balances/suppliers", SETTINGS)).toBe(
      true,
    );
    expect(navGroupContainsPathname("Overview", "/payables", SETTINGS)).toBe(true);
    expect(navGroupContainsPathname("Settings", "/settings/members", SETTINGS)).toBe(
      true,
    );
  });

  it("matches general ledger under Overview via Review hub", () => {
    expect(
      navGroupContainsPathname("Overview", "/review/posted", SETTINGS),
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

describe("sidebarGroupRenderMode", () => {
  it("Customers, Banking, Reports, and Settings are always direct links", () => {
    for (const label of ["Customers", "Cash & bank", "Reports", "Settings"] as const) {
      expect(sidebarGroupRenderMode(label, { deliveryEnabled: true })).toBe("link");
      expect(sidebarGroupRenderMode(label, { deliveryEnabled: false })).toBe("link");
    }
  });
});
