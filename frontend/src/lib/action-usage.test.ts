import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordActionUsage,
  getTopActions,
  clearActionUsage,
  DEFAULT_TOP_ACTIONS,
} from "@/lib/action-usage";

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

describe("RecordHub integration", () => {
  it("imports getTopActions and shows Most used section", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/record/record-hub.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("getTopActions");
    expect(source).toContain("Most used");
  });

  it("records usage on openRecordAction", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/quick-actions.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("recordActionUsage");
    expect(source).toContain("recordActionUsage(entityId, key)");
  });

  it("shows Most used section with Star icon and 4-col grid", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/record/record-hub.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("Star");
    expect(source).toContain("Most used");
    expect(source).toContain("topActions");
    expect(source).toContain("lg:grid-cols-4");
  });

  it("filters top actions through delivery gating", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../components/record/record-hub.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("filterRecordActions(RECORD_ACTIONS, { deliveryEnabled })");
  });
});
