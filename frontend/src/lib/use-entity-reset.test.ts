/** Entity-switch reset helpers — Slice 11.20. */

import { describe, expect, it } from "vitest";

import {
  createEntitySwitchTracker,
  entityResetKey,
} from "./use-entity-reset";

describe("entityResetKey", () => {
  it("returns entityId for use as a React key", () => {
    expect(entityResetKey("entity-a")).toBe("entity-a");
    expect(entityResetKey("")).toBe("");
  });
});

describe("createEntitySwitchTracker", () => {
  it("does not reset on first entity sync", () => {
    const tracker = createEntitySwitchTracker();
    expect(tracker.sync("entity-a")).toBe(false);
  });

  it("signals reset when entityId changes", () => {
    const tracker = createEntitySwitchTracker();
    tracker.sync("entity-a");
    expect(tracker.sync("entity-a")).toBe(false);
    expect(tracker.sync("entity-b")).toBe(true);
    expect(tracker.sync("entity-b")).toBe(false);
  });

  it("signals reset when entity clears", () => {
    const tracker = createEntitySwitchTracker();
    tracker.sync("entity-a");
    expect(tracker.sync("")).toBe(true);
  });
});

describe("useEntitySwitchReset ready gate", () => {
  it("defers first sync until ready via tracker recreation pattern", () => {
    const tracker = createEntitySwitchTracker();
    expect(tracker.sync("stale-entity:acct")).toBe(false);
    expect(tracker.sync("correct-entity:acct")).toBe(true);
  });

  it("discards tracker state when not ready so hydration does not false-reset", () => {
    let tracker: ReturnType<typeof createEntitySwitchTracker> | null = null;

    const syncWhenReady = (sessionKey: string, ready: boolean) => {
      if (!ready) {
        tracker = null;
        return false;
      }
      if (!tracker) tracker = createEntitySwitchTracker();
      return tracker.sync(sessionKey);
    };

    expect(syncWhenReady("stale:acct", false)).toBe(false);
    expect(syncWhenReady("correct:acct", true)).toBe(false);
    expect(syncWhenReady("correct:acct", true)).toBe(false);
    expect(syncWhenReady("other:acct", true)).toBe(true);
  });
});
