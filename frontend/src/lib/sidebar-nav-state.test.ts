import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COLLAPSIBLE_NAV_GROUP_LABELS,
  navGroupContainsPathname,
  readSidebarGroupState,
  resolveSidebarGroupState,
  SIDEBAR_NAV_STORAGE_KEY,
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

describe("resolveSidebarGroupState", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("auto-expands the group containing the current route", () => {
    const state = resolveSidebarGroupState("/sales", SETTINGS, {});
    expect(state.Sales).toBe(true);
    expect(state["Expenses & suppliers"]).toBe(false);
  });

  it("restores persisted open groups for non-active sections", () => {
    const stored = { Reports: true, Settings: false };
    const state = resolveSidebarGroupState("/sales", SETTINGS, stored);
    expect(state.Sales).toBe(true);
    expect(state.Reports).toBe(true);
    expect(state.Settings).toBe(false);
  });

  it("allows multiple groups open via persisted state", () => {
    const stored = { "Cash & bank": true, People: true };
    const state = resolveSidebarGroupState("/", SETTINGS, stored);
    expect(state["Cash & bank"]).toBe(true);
    expect(state.People).toBe(true);
    expect(state.Sales).toBe(false);
  });
});

describe("toggleSidebarGroupState", () => {
  it("flips one group without closing others", () => {
    const next = toggleSidebarGroupState(
      { Sales: true, Reports: true },
      "Reports",
    );
    expect(next).toEqual({ Sales: true, Reports: false });
  });
});

describe("navGroupContainsPathname", () => {
  it("matches delivery under Sales", () => {
    expect(navGroupContainsPathname("Sales", "/delivery/platforms", SETTINGS)).toBe(
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

  it("writes and reads group state", () => {
    writeSidebarGroupState({ Sales: true, Settings: false });
    expect(readSidebarGroupState()).toEqual({ Sales: true, Settings: false });
    expect(window.localStorage.getItem(SIDEBAR_NAV_STORAGE_KEY)).toContain("Sales");
  });

  it("survives reload via read after write", () => {
    writeSidebarGroupState({ People: true });
    expect(readSidebarGroupState().People).toBe(true);
  });
});

describe("collapsible group labels", () => {
  it("excludes Overview (dashboard is pinned separately)", () => {
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).not.toContain("Overview");
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).toContain("Sales");
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).toContain("Settings");
  });
});
