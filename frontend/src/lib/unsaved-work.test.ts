/** Unsaved-work registry — Slice 12.0b. */

import { describe, expect, it } from "vitest";

// Test the dirty-source merge logic without React rendering.
function createDirtyRegistry() {
  const sources: Record<string, boolean> = {};

  return {
    setDirty(sourceId: string, dirty: boolean) {
      if (!dirty) {
        delete sources[sourceId];
        return;
      }
      sources[sourceId] = true;
    },
    hasUnsavedWork() {
      return Object.values(sources).some(Boolean);
    },
  };
}

describe("unsaved work registry", () => {
  it("is clean when no sources are dirty", () => {
    const registry = createDirtyRegistry();
    expect(registry.hasUnsavedWork()).toBe(false);
  });

  it("reports dirty when any source is dirty", () => {
    const registry = createDirtyRegistry();
    registry.setDirty("manual-expense", true);
    expect(registry.hasUnsavedWork()).toBe(true);
  });

  it("clears a source when it becomes clean", () => {
    const registry = createDirtyRegistry();
    registry.setDirty("manual-expense", true);
    registry.setDirty("manual-expense", false);
    expect(registry.hasUnsavedWork()).toBe(false);
  });
});
