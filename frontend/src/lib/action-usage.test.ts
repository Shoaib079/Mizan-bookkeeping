import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordActionUsage,
  getTopActions,
  clearActionUsage,
  DEFAULT_TOP_ACTIONS,
} from "@/lib/action-usage";
import { sourceDeclaring } from "@/test-support/source";

const ENTITY_A = "entity-aaa";
const ENTITY_B = "entity-bbb";

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("action-usage", () => {
  it("returns DEFAULT_TOP_ACTIONS when no usage history exists", () => {
    const result = getTopActions(ENTITY_A);
    expect(result).toEqual(DEFAULT_TOP_ACTIONS);
  });

  it("returns default actions limited by custom limit", () => {
    const result = getTopActions(ENTITY_A, 2);
    expect(result).toEqual(DEFAULT_TOP_ACTIONS.slice(0, 2));
  });

  it("records and ranks by usage count", () => {
    recordActionUsage(ENTITY_A, "efatura");
    recordActionUsage(ENTITY_A, "efatura");
    recordActionUsage(ENTITY_A, "efatura");
    recordActionUsage(ENTITY_A, "closeDay");
    recordActionUsage(ENTITY_A, "closeDay");
    recordActionUsage(ENTITY_A, "sales");

    const top = getTopActions(ENTITY_A, 3);
    expect(top[0]).toBe("efatura");
    expect(top[1]).toBe("closeDay");
    expect(top[2]).toBe("sales");
  });

  it("isolates usage per entity", () => {
    recordActionUsage(ENTITY_A, "closeDay");
    recordActionUsage(ENTITY_A, "closeDay");
    recordActionUsage(ENTITY_B, "efatura");

    const topA = getTopActions(ENTITY_A, 1);
    const topB = getTopActions(ENTITY_B, 1);
    expect(topA[0]).toBe("closeDay");
    expect(topB[0]).toBe("efatura");
  });

  it("clearActionUsage resets to defaults", () => {
    recordActionUsage(ENTITY_A, "efatura");
    clearActionUsage(ENTITY_A);
    expect(getTopActions(ENTITY_A)).toEqual(DEFAULT_TOP_ACTIONS);
  });

  it("handles corrupted localStorage gracefully", () => {
    store["mizan:action-usage:entity-aaa"] = "not-json";
    const result = getTopActions(ENTITY_A);
    expect(result).toEqual(DEFAULT_TOP_ACTIONS);
  });

  it("handles localStorage with wrong shape gracefully", () => {
    store["mizan:action-usage:entity-aaa"] = JSON.stringify({ counts: "bad" });
    const result = getTopActions(ENTITY_A);
    expect(result).toEqual(DEFAULT_TOP_ACTIONS);
  });
});

describe("RecordDesk integration", () => {
  it("uses RECORD_DESK_TILES for the icon grid", () => {
    const source = sourceDeclaring("RecordDesk");
    expect(source).toContain("RECORD_DESK_TILES");
    expect(source).toContain("RecordDeskIconGrid");
  });

  it("records usage on openRecordAction", () => {
    const source = sourceDeclaring("QuickActionsProvider");
    expect(source).toContain("recordActionUsage");
    expect(source).toContain("recordActionUsage(entityId, key)");
  });

  it("gates the desk behind entity access", () => {
    const source = sourceDeclaring("RecordDesk");
    expect(source).toContain("useEntityAccess");
    expect(source).toContain("shouldShowNewMenu");
  });

  it("keeps Upload / Count / Close extras reachable from More", () => {
    const source = sourceDeclaring("RecordDesk");
    expect(source).toContain("RECORD_DESK_EXTRA_ACTION_IDS");
    expect(source).toContain("openRecordAction");
  });

  it("always shows Most used when entity selected (defaults fill it)", () => {
    const top = getTopActions(ENTITY_A, 4);
    expect(top.length).toBe(4);
    expect(top).toEqual(DEFAULT_TOP_ACTIONS);
  });
});
