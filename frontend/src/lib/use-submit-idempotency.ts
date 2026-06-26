"use client";

/** Stable Idempotency-Key per submit intent — CURSOR_RULES §1 rule 15, Slice 11.19. */

import { useCallback, useMemo, useRef } from "react";

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type SubmitIdempotencyStore = {
  beginSubmit: () => string;
  completeSubmit: () => void;
  resetSubmit: () => void;
  peekKey: () => string | null;
};

/** Pure store for tests and non-React callers. */
export function createSubmitIdempotencyStore(): SubmitIdempotencyStore {
  let key: string | null = null;
  return {
    beginSubmit() {
      if (!key) key = newIdempotencyKey();
      return key;
    },
    completeSubmit() {
      key = null;
    },
    resetSubmit() {
      key = null;
    },
    peekKey() {
      return key;
    },
  };
}

export type SubmitIdempotency = SubmitIdempotencyStore;

export function useSubmitIdempotency(): SubmitIdempotency {
  const storeRef = useRef<SubmitIdempotencyStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSubmitIdempotencyStore();
  }

  const beginSubmit = useCallback(() => storeRef.current!.beginSubmit(), []);
  const completeSubmit = useCallback(() => storeRef.current!.completeSubmit(), []);
  const resetSubmit = useCallback(() => storeRef.current!.resetSubmit(), []);
  const peekKey = useCallback(() => storeRef.current!.peekKey(), []);

  return useMemo(
    () => ({ beginSubmit, completeSubmit, resetSubmit, peekKey }),
    [beginSubmit, completeSubmit, resetSubmit, peekKey],
  );
}
