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
  it("returns empty for direct-link intents (UX6 collapsed sidebar)", () => {
    expect(sidebarGroupStateForPathname("/sales", SETTINGS)).toEqual({});
    expect(sidebarGroupStateForPathname("/record", SETTINGS)).toEqual({});
    expect(sidebarGroupStateForPathname("/reports", SETTINGS)).toEqual({});
  });

  it("returns empty on Dashboard (pinned outside groups)", () => {
    expect(sidebarGroupStateForPathname("/", SETTINGS)).toEqual({});
  });
});

describe("resolveSidebarGroupState", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("returns empty when all sidebar groups are direct links", () => {
    expect(resolveSidebarGroupState("/sales", SETTINGS, {})).toEqual({});
    expect(resolveSidebarGroupState("/", SETTINGS, { Reports: true })).toEqual({});
  });
});

describe("toggleSidebarGroupState", () => {
  it("still enforces single open group for any future accordion", () => {
    const next = toggleSidebarGroupState({ Reports: true }, "Set up");
    expect(next).toEqual({ "Set up": true });
    expect(openSidebarGroupCount(next)).toBe(1);
  });
});

describe("navGroupContainsPathname", () => {
  it("matches legacy domain routes to collapsed intents", () => {
    expect(navGroupContainsPathname("Overview", "/sales", SETTINGS)).toBe(true);
    expect(navGroupContainsPathname("Overview", "/banking/cash", SETTINGS)).toBe(
      true,
    );
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("persists a single open group", () => {
    writeSidebarGroupState({ Reports: true });
    expect(readSidebarGroupState()).toEqual({ Reports: true });
    expect(window.localStorage.getItem(SIDEBAR_NAV_STORAGE_KEY)).toContain("Reports");
  });
});

describe("collapsible group labels", () => {
  it("excludes Overview (dashboard + hub intents are direct links)", () => {
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).not.toContain("Overview");
    expect(COLLAPSIBLE_NAV_GROUP_LABELS).toEqual(["Reports"]);
  });
});

describe("sidebarGroupRenderMode", () => {
  it("Reports is always a direct link", () => {
    for (const label of ["Reports"] as const) {
      expect(sidebarGroupRenderMode(label, { deliveryEnabled: true })).toBe("link");
      expect(sidebarGroupRenderMode(label, { deliveryEnabled: false })).toBe("link");
    }
  });
});
