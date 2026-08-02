"use client";

/** Form draft autosave + resume — DESIGN_SYSTEM.md §10, Phase 10 Slice 7. */

import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_PREFIX = "mizan:draft";

export function formDraftStorageKey(
  entityId: string | null | undefined,
  formKey: string,
): string | null {
  if (!entityId) return null;
  return `${DRAFT_PREFIX}:${entityId}:${formKey}`;
}

export function statesDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode — ignore.
  }
}

function removeDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

type UseFormDraftOptions<T> = {
  entityId: string | null | undefined;
  formKey: string;
  value: T;
  enabled?: boolean;
  isEmpty: (value: T) => boolean;
  debounceMs?: number;
};

export function useFormDraft<T>({
  entityId,
  formKey,
  value,
  enabled = true,
  isEmpty,
  debounceMs = 400,
}: UseFormDraftOptions<T>) {
  const storageKey = formDraftStorageKey(entityId, formKey);
  const [resumeDraft, setResumeDraft] = useState<T | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const resumeCheckedRef = useRef(false);

  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    removeDraft(storageKey);
    setResumeDraft(null);
  }, [storageKey]);

  useEffect(() => {
    resumeCheckedRef.current = false;
    setResumeDraft(null);
    setStorageReady(false);
  }, [storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey) {
      if (!enabled) setStorageReady(true);
      return;
    }
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    const stored = readDraft<T>(storageKey);
    if (stored !== null && !isEmpty(stored)) {
      setResumeDraft(stored);
    }
    setStorageReady(true);
  }, [enabled, storageKey, isEmpty]);

  useEffect(() => {
    // Wait until storage has been probed — otherwise an empty initial mount
    // would delete a saved draft before Resume/auto-hydrate can run.
    if (!enabled || !storageKey || !storageReady || resumeDraft !== null) return;
    if (isEmpty(value)) {
      removeDraft(storageKey);
      return;
    }
    const timer = window.setTimeout(() => writeDraft(storageKey, value), debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, storageKey, storageReady, value, isEmpty, debounceMs, resumeDraft]);

  const acceptResume = useCallback(() => {
    const draft = resumeDraft;
    setResumeDraft(null);
    return draft;
  }, [resumeDraft]);

  const declineResume = useCallback(() => {
    clearDraft();
    setResumeDraft(null);
  }, [clearDraft]);

  return {
    resumeDraft,
    /** True after the first localStorage read for the current entity/form key. */
    storageReady,
    acceptResume,
    declineResume,
    clearDraft,
  };
}
