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
  const resumeCheckedRef = useRef(false);

  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    removeDraft(storageKey);
    setResumeDraft(null);
  }, [storageKey]);

  useEffect(() => {
    resumeCheckedRef.current = false;
    setResumeDraft(null);
  }, [storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey || resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    const stored = readDraft<T>(storageKey);
    if (stored !== null && !isEmpty(stored)) {
      setResumeDraft(stored);
    }
  }, [enabled, storageKey, isEmpty]);

  useEffect(() => {
    if (!enabled || !storageKey || resumeDraft !== null) return;
    if (isEmpty(value)) {
      removeDraft(storageKey);
      return;
    }
    const timer = window.setTimeout(() => writeDraft(storageKey, value), debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, storageKey, value, isEmpty, debounceMs, resumeDraft]);

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
    acceptResume,
    declineResume,
    clearDraft,
  };
}
