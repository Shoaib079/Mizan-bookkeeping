"use client";

/** Mobile top-bar title — PageHeader owns the string; the shell displays it once. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MobileShellTitleContextValue = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const MobileShellTitleContext =
  createContext<MobileShellTitleContextValue | null>(null);

export function MobileShellTitleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [title, setTitleState] = useState<string | null>(null);
  const setTitle = useCallback((next: string | null) => {
    setTitleState(next);
  }, []);
  const value = useMemo(
    () => ({ title, setTitle }),
    [title, setTitle],
  );
  return (
    <MobileShellTitleContext.Provider value={value}>
      {children}
    </MobileShellTitleContext.Provider>
  );
}

/** Title registered by the active PageHeader, if any. */
export function useMobileShellTitle(): string | null {
  return useContext(MobileShellTitleContext)?.title ?? null;
}

/** Push this page's title into the mobile top bar; clear on unmount. */
export function useRegisterMobileShellTitle(pageTitle: string) {
  const ctx = useContext(MobileShellTitleContext);
  const setTitle = ctx?.setTitle;
  useEffect(() => {
    if (!setTitle) return;
    setTitle(pageTitle);
    return () => setTitle(null);
  }, [pageTitle, setTitle]);
}
