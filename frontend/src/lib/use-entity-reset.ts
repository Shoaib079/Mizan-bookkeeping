"use client";

/** Entity-switch state reset — CURSOR_RULES §1.16, Phase 11 Slice 11.20. */

import { useLayoutEffect, useRef } from "react";

/** React `key` that changes when the active entity changes. */
export function entityResetKey(entityId: string): string {
  return entityId || "";
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

/** Run `reset` synchronously before paint when `sessionKey` changes (after `ready`).
 *
 * Sixteen pages used to call this to clear their own state on entity switch.
 * They no longer need to: `EntityScopedTree` keys the whole page tree by
 * entity id, so switching restaurant remounts everything below it and there
 * is nothing left for a page to remember.
 *
 * One caller remains, and it is the reason this still exists. The statement
 * import panel keys on `statementImportSessionKey(entityId, moneyAccountId)`
 * — a half-finished column mapping belongs to *this account's* import, not
 * just to this restaurant, and changing account within one entity does not
 * remount anything. The remount covers the entity dimension only.
 */
export function useEntitySwitchReset(
  sessionKey: string,
  reset: () => void,
  options?: { ready?: boolean },
): void {
  const ready = options?.ready ?? true;
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const trackerRef = useRef<EntitySwitchTracker | null>(null);

  useLayoutEffect(() => {
    if (!ready) {
      trackerRef.current = null;
      return;
    }
    if (!trackerRef.current) {
      trackerRef.current = createEntitySwitchTracker();
    }
    if (trackerRef.current.sync(sessionKey)) {
      resetRef.current();
    }
  }, [sessionKey, ready]);
}
