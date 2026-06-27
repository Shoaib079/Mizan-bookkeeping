"use client";

/** Entity-switch state reset — CURSOR_RULES §1.16, Phase 11 Slice 11.20. */

import { useLayoutEffect, useRef } from "react";

/** React `key` that changes when the active entity changes. */
export function entityResetKey(entityId: string): string {
  return entityId || "";
}

export function useEntityResetKey(entityId: string): string {
  return entityResetKey(entityId);
}

type EntitySwitchTracker = {
  sync: (entityId: string) => boolean;
};

/** Testable tracker — returns true when entityId changed (skip first sync). */
export function createEntitySwitchTracker(): EntitySwitchTracker {
  let seeded = false;
  let previous = "";

  return {
    sync(entityId: string): boolean {
      if (!seeded) {
        seeded = true;
        previous = entityId;
        return false;
      }
      if (previous === entityId) return false;
      previous = entityId;
      return true;
    },
  };
}

/** Run `reset` synchronously before paint when `entityId` changes. */
export function useEntitySwitchReset(entityId: string, reset: () => void): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const trackerRef = useRef<EntitySwitchTracker | null>(null);

  if (!trackerRef.current) {
    trackerRef.current = createEntitySwitchTracker();
  }

  useLayoutEffect(() => {
    if (trackerRef.current?.sync(entityId)) {
      resetRef.current();
    }
  }, [entityId]);
}
