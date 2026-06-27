"use client";

/** Tracks dirty forms so entity switch / sign-out can warn first — Slice 12.0b. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type UnsavedWorkContextValue = {
  hasUnsavedWork: boolean;
  setDirty: (sourceId: string, dirty: boolean) => void;
};

const UnsavedWorkContext = createContext<UnsavedWorkContextValue | null>(null);

export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const [dirtySources, setDirtySources] = useState<Record<string, boolean>>({});

  const setDirty = useCallback((sourceId: string, dirty: boolean) => {
    setDirtySources((prev) => {
      if (!dirty) {
        if (!(sourceId in prev)) return prev;
        const next = { ...prev };
        delete next[sourceId];
        return next;
      }
      if (prev[sourceId]) return prev;
      return { ...prev, [sourceId]: true };
    });
  }, []);

  const hasUnsavedWork = useMemo(
    () => Object.values(dirtySources).some(Boolean),
    [dirtySources],
  );

  const value = useMemo(
    () => ({ hasUnsavedWork, setDirty }),
    [hasUnsavedWork, setDirty],
  );

  return (
    <UnsavedWorkContext.Provider value={value}>
      {children}
    </UnsavedWorkContext.Provider>
  );
}

export function useUnsavedWork() {
  const ctx = useContext(UnsavedWorkContext);
  if (!ctx) {
    throw new Error("useUnsavedWork must be used within UnsavedWorkProvider");
  }
  return ctx;
}

/** Register a form's dirty flag; clears automatically on unmount. */
export function useRegisterUnsaved(sourceId: string, dirty: boolean, enabled = true) {
  const { setDirty } = useUnsavedWork();

  useEffect(() => {
    if (!enabled) {
      setDirty(sourceId, false);
      return;
    }
    setDirty(sourceId, dirty);
    return () => setDirty(sourceId, false);
  }, [dirty, enabled, setDirty, sourceId]);
}
